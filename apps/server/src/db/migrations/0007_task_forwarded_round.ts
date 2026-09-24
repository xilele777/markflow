import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export async function up(db: AnyDb): Promise<void> {
  await sql`ALTER TABLE label_task ADD COLUMN forwarded_round INTEGER NOT NULL DEFAULT 0`.execute(
    db,
  );
  // 旧数据中下游已在本轮完成之后处理过，说明推进已经发生，避免升级后旧消息重开下游。
  await sql`UPDATE label_task AS source SET forwarded_round = source.round
    WHERE source.status = 4 AND EXISTS (
      SELECT 1 FROM label_task AS target
      WHERE target.case_id = source.case_id AND target.data_sample_id = source.data_sample_id
        AND target.task_type > source.task_type AND target.update_time >= source.update_time
    )`.execute(db);
}

export async function down(db: AnyDb): Promise<void> {
  await sql`ALTER TABLE label_task DROP COLUMN forwarded_round`.execute(db);
}
