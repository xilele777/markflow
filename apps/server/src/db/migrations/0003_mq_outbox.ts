// V3：mq_outbox（规则表 0004 §9）。业务事务内写一行，事务提交后投递到 BullMQ；投递失败由定时器按 next_retry_time 重投。
// 成功即删行，所以表里只留待投递 / 投递失败的消息。
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export async function up(db: AnyDb): Promise<void> {
  await sql
    .raw(
      `CREATE TABLE mq_outbox (
  id               BIGSERIAL PRIMARY KEY,
  queue            VARCHAR(64) NOT NULL,
  job_name         VARCHAR(64) NOT NULL,
  job_id           VARCHAR(128),
  payload          JSONB NOT NULL,
  status           INTEGER NOT NULL DEFAULT 1,
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_retry_time  BIGINT NOT NULL,
  last_error       VARCHAR(1024),
  create_time      BIGINT NOT NULL,
  update_time      BIGINT NOT NULL
)`,
    )
    .execute(db);
  await sql.raw(`COMMENT ON COLUMN mq_outbox.status IS '1 PENDING'`).execute(db);
  await sql
    .raw(`CREATE INDEX idx_mq_outbox_status_retry ON mq_outbox (status, next_retry_time)`)
    .execute(db);
}

export async function down(db: AnyDb): Promise<void> {
  await sql.raw(`DROP TABLE IF EXISTS mq_outbox`).execute(db);
}
