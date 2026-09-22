// V5：sys_notification（M5 站内通知）。收件人按 username（citext，与 label_task.annotator / sys_user.username 同语义）。
// 三类事件写入：派发（TASK_DISPATCHED）、驳回（TASK_REJECTED）、截止（CASE_DEADLINE），另有 case 自动结束（CASE_FINISHED）。
// 未读 = read_time IS NULL；按 (username, read_time, id) 查未读数与列表。case 截止时间存在 label_case.ext.deadline，不加列。
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export async function up(db: AnyDb): Promise<void> {
  await sql
    .raw(
      `CREATE TABLE sys_notification (
  id           BIGSERIAL PRIMARY KEY,
  username     CITEXT NOT NULL,
  type         VARCHAR(32) NOT NULL,
  title        VARCHAR(200) NOT NULL,
  content      VARCHAR(1000),
  ref_type     VARCHAR(32),
  ref_id       BIGINT,
  read_time    BIGINT,
  create_time  BIGINT NOT NULL
)`,
    )
    .execute(db);
  await sql
    .raw(
      `COMMENT ON COLUMN sys_notification.type IS 'TASK_DISPATCHED / TASK_REJECTED / CASE_DEADLINE / CASE_FINISHED'`,
    )
    .execute(db);
  await sql
    .raw(
      `CREATE INDEX idx_sys_notification_user ON sys_notification (username, read_time, id DESC)`,
    )
    .execute(db);
}

export async function down(db: AnyDb): Promise<void> {
  await sql.raw(`DROP TABLE IF EXISTS sys_notification`).execute(db);
}
