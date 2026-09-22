// V1：11 张表，由后端索引 §5 / 迁移报告附录 A 的 MySQL 结构转为 PostgreSQL。
// 转换约定：
// - 时间戳 bigint 毫秒；json → jsonb；tinyint(1) → boolean；AUTO_INCREMENT → bigserial。
// - MySQL 库级 utf8mb4_general_ci 使所有字符串等值比较大小写不敏感；PG 默认区分大小写。
//   对用作"查找键"的列（username / space_code / *_code / dataset_name / case name / annotator / config_key）
//   使用 citext 扩展类型复刻该语义，唯一约束随之也大小写不敏感。
// - PG 索引名全库唯一，MySQL 版同名索引（idx_space_name 等）加表前缀。
// - label_task_group 唯一键使用 NULLS NOT DISTINCT：池组 annotator 为 null，每个 (case, type, stage) 只允许一个池。
import { sql, type Kysely } from 'kysely';

// Kysely 的 Migration 接口要求 Kysely<any>。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

const AUDIT = `
  creator      VARCHAR(64),
  operator     VARCHAR(64),
  create_time  BIGINT NOT NULL,
  update_time  BIGINT NOT NULL`;

const STATEMENTS: string[] = [
  `CREATE EXTENSION IF NOT EXISTS citext`,

  `CREATE TABLE sys_user (
  id               BIGSERIAL PRIMARY KEY,
  username         CITEXT NOT NULL,
  display_name     VARCHAR(64) NOT NULL DEFAULT '',
  password_hash    VARCHAR(128) NOT NULL,
  is_system_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  status           INTEGER NOT NULL DEFAULT 0,${AUDIT},
  CONSTRAINT uk_sys_user_username UNIQUE (username)
)`,
  `COMMENT ON COLUMN sys_user.status IS '0 NORMAL / 1 DISABLED'`,

  `CREATE TABLE workspace (
  id           BIGSERIAL PRIMARY KEY,
  space_code   CITEXT NOT NULL,
  name         VARCHAR(128) NOT NULL,
  description  VARCHAR(512),${AUDIT},
  CONSTRAINT uk_workspace_space_code UNIQUE (space_code)
)`,

  `CREATE TABLE user_workspace_ship (
  id             BIGSERIAL PRIMARY KEY,
  workspace_id   BIGINT NOT NULL,
  user_id        BIGINT NOT NULL,
  role_in_space  INTEGER NOT NULL,
  creator        VARCHAR(64),
  create_time    BIGINT NOT NULL,
  CONSTRAINT uk_user_workspace_ship_ws_user_role UNIQUE (workspace_id, user_id, role_in_space)
)`,
  `COMMENT ON COLUMN user_workspace_ship.role_in_space IS '1 LABELER / 2 REVIEWER / 3 LABEL_ADMIN'`,
  `CREATE INDEX idx_user_workspace_ship_user ON user_workspace_ship (user_id)`,

  `CREATE TABLE sys_config (
  id           BIGSERIAL PRIMARY KEY,
  config_key   CITEXT NOT NULL,
  config_name  VARCHAR(128) NOT NULL DEFAULT '',
  type         INTEGER NOT NULL,
  content      TEXT,
  description  VARCHAR(512),
  deleted      INTEGER NOT NULL DEFAULT 0,${AUDIT},
  CONSTRAINT uk_sys_config_key UNIQUE (config_key)
)`,
  `COMMENT ON COLUMN sys_config.type IS '1 STRING / 2 JSON / 3 YAML / 4 CLASS_PATH'`,

  `CREATE TABLE lingshu_label_tool (
  id                      BIGSERIAL PRIMARY KEY,
  label_tool_code         CITEXT NOT NULL,
  label_tool_name         VARCHAR(128) NOT NULL,
  label_tool_type         INTEGER NOT NULL,
  label_tool_url          VARCHAR(1024),
  label_tool_json_schema  JSONB,
  label_tool_page_schema  JSONB,
  deleted                 INTEGER NOT NULL DEFAULT 0,
  ext                     JSONB,${AUDIT},
  CONSTRAINT uk_label_tool_code UNIQUE (label_tool_code)
)`,
  `COMMENT ON COLUMN lingshu_label_tool.label_tool_type IS '1 BUILTIN / 2 IFRAME'`,

  `CREATE TABLE lingshu_dataset (
  id                     BIGSERIAL PRIMARY KEY,
  space_code             CITEXT NOT NULL,
  dataset_name           CITEXT NOT NULL,
  dataset_desc           VARCHAR(512),
  dataset_type           INTEGER NOT NULL,
  service_obj_name       CITEXT,
  latest_version_number  INTEGER NOT NULL DEFAULT 0,
  deleted                INTEGER NOT NULL DEFAULT 0,
  ext                    JSONB,${AUDIT}
)`,
  `COMMENT ON COLUMN lingshu_dataset.dataset_type IS '1 ANNOTATION / 2 STREAM_ANNOTATION / 3 RESULT'`,
  `COMMENT ON COLUMN lingshu_dataset.service_obj_name IS 'labelToolCode'`,
  `CREATE INDEX idx_dataset_space_name ON lingshu_dataset (space_code, dataset_name, deleted)`,

  `CREATE TABLE lingshu_dataset_version (
  id              BIGSERIAL PRIMARY KEY,
  dataset_id      BIGINT NOT NULL,
  version_number  INTEGER NOT NULL,
  version_desc    VARCHAR(512),
  oss_path        VARCHAR(512),
  upload_status   INTEGER NOT NULL,
  sample_count    BIGINT NOT NULL DEFAULT 0,
  deleted         INTEGER NOT NULL DEFAULT 0,
  ext             JSONB,${AUDIT},
  CONSTRAINT uk_dataset_version UNIQUE (dataset_id, version_number)
)`,
  `COMMENT ON COLUMN lingshu_dataset_version.upload_status IS '1 PARSING / 2 READY / 3 PARSE_FAILED'`,

  `CREATE TABLE lingshu_dataset_sample (
  id                  BIGSERIAL PRIMARY KEY,
  dataset_version_id  BIGINT NOT NULL,
  biz_id              VARCHAR(64),
  sample_data_json    JSONB,
  deleted             INTEGER NOT NULL DEFAULT 0,
  ext                 JSONB,${AUDIT}
)`,
  `CREATE INDEX idx_dataset_sample_version_biz ON lingshu_dataset_sample (dataset_version_id, biz_id)`,
  `CREATE INDEX idx_dataset_sample_version_id ON lingshu_dataset_sample (dataset_version_id, id)`,

  `CREATE TABLE label_case (
  id                               BIGSERIAL PRIMARY KEY,
  space_code                       CITEXT NOT NULL,
  name                             CITEXT NOT NULL,
  description                      VARCHAR(1024),
  data_source_type                 INTEGER NOT NULL,
  dataset_version_id               BIGINT,
  label_result_dataset_version_id  BIGINT,
  label_tool_code                  CITEXT NOT NULL,
  task_plan_config                 JSONB,
  assignment_config                JSONB,
  status                           INTEGER NOT NULL,
  version                          BIGINT NOT NULL DEFAULT 0,
  deleted                          INTEGER NOT NULL DEFAULT 0,
  ext                              JSONB,${AUDIT}
)`,
  `COMMENT ON COLUMN label_case.data_source_type IS '1 DATASET / 2 STREAM'`,
  `COMMENT ON COLUMN label_case.status IS '1 NOT_STARTED / 2 RUNNING / 3 PAUSED / 4 FINISHED'`,
  `CREATE INDEX idx_label_case_space_status ON label_case (space_code, deleted, status)`,
  `CREATE INDEX idx_label_case_space_name ON label_case (space_code, name, deleted)`,

  `CREATE TABLE label_task_group (
  id               BIGSERIAL PRIMARY KEY,
  case_id          BIGINT NOT NULL,
  stage            INTEGER NOT NULL,
  type             INTEGER NOT NULL,
  annotator        CITEXT,
  name             VARCHAR(255),
  label_tool_code  CITEXT,
  status           INTEGER NOT NULL,
  total_count      BIGINT NOT NULL DEFAULT 0,
  done_count       BIGINT NOT NULL DEFAULT 0,
  cost_time        BIGINT NOT NULL DEFAULT 0,
  ext              JSONB,
  create_time      BIGINT NOT NULL,
  update_time      BIGINT NOT NULL,
  CONSTRAINT uk_task_group_case_type_stage_annotator
    UNIQUE NULLS NOT DISTINCT (case_id, type, stage, annotator)
)`,
  `COMMENT ON COLUMN label_task_group.type IS '1 PERSONAL / 2 AI_PRE_LABEL_POOL / 3 LABEL_POOL / 4 AI_PRE_REVIEW_POOL / 5 REVIEW_POOL / 6 RECHECK_POOL'`,
  `COMMENT ON COLUMN label_task_group.status IS '1 PENDING / 2 RUNNING / 3 DONE'`,
  `CREATE INDEX idx_task_group_annotator_stage ON label_task_group (annotator, type, stage)`,

  `CREATE TABLE label_task (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL,
  task_group_id   BIGINT NOT NULL,
  task_group_seq  INTEGER NOT NULL DEFAULT 0,
  task_type       INTEGER NOT NULL,
  status          INTEGER NOT NULL,
  round           INTEGER NOT NULL DEFAULT 1,
  data_sample_id  BIGINT NOT NULL,
  biz_id          VARCHAR(64),
  annotator       CITEXT,
  claim_time      BIGINT,
  cost_time       BIGINT,
  ext             JSONB,
  operator        VARCHAR(64),
  create_time     BIGINT NOT NULL,
  update_time     BIGINT NOT NULL,
  CONSTRAINT uk_task_case_type_sample UNIQUE (case_id, task_type, data_sample_id)
)`,
  `COMMENT ON COLUMN label_task.task_type IS '1 AI_LABEL / 2 LABEL / 3 AI_REVIEW / 4 FIRST_CHECK / 5 RECHECK'`,
  `COMMENT ON COLUMN label_task.status IS '1 PENDING_DISPATCH / 2 LABELING / 3 REVIEWING / 4 DONE / 5 REWORK'`,
  `CREATE INDEX idx_task_group_status_seq ON label_task (task_group_id, status, task_group_seq)`,
  `CREATE INDEX idx_task_annotator_status ON label_task (annotator, status, task_type)`,
  `CREATE INDEX idx_task_claim_time ON label_task (claim_time)`,
];

const TABLES_IN_DROP_ORDER = [
  'label_task',
  'label_task_group',
  'label_case',
  'lingshu_dataset_sample',
  'lingshu_dataset_version',
  'lingshu_dataset',
  'lingshu_label_tool',
  'sys_config',
  'user_workspace_ship',
  'workspace',
  'sys_user',
];

export async function up(db: AnyDb): Promise<void> {
  for (const statement of STATEMENTS) {
    await sql.raw(statement).execute(db);
  }
}

export async function down(db: AnyDb): Promise<void> {
  for (const table of TABLES_IN_DROP_ORDER) {
    await sql.raw(`DROP TABLE IF EXISTS ${table}`).execute(db);
  }
}
