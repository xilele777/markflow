// V4：web_vitals（M4 前端性能监控）。前端 sendBeacon 上报的 Core Web Vitals 样本，按 (name, create_time) 查询汇总。
// 容量由服务层修剪（只保留最近 N 条），不做分区。
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export async function up(db: AnyDb): Promise<void> {
  await sql
    .raw(
      `CREATE TABLE web_vitals (
  id               BIGSERIAL PRIMARY KEY,
  name             VARCHAR(16) NOT NULL,
  value            INTEGER NOT NULL,
  rating           VARCHAR(32),
  page             VARCHAR(200),
  navigation_type  VARCHAR(32),
  metric_id        VARCHAR(64),
  create_time      BIGINT NOT NULL
)`,
    )
    .execute(db);
  await sql.raw(`COMMENT ON COLUMN web_vitals.value IS 'ms 取整；CLS 为 ×1000 取整'`).execute(db);
  await sql.raw(`CREATE INDEX idx_web_vitals_time ON web_vitals (create_time)`).execute(db);
  await sql
    .raw(`CREATE INDEX idx_web_vitals_name_time ON web_vitals (name, create_time)`)
    .execute(db);
}

export async function down(db: AnyDb): Promise<void> {
  await sql.raw(`DROP TABLE IF EXISTS web_vitals`).execute(db);
}
