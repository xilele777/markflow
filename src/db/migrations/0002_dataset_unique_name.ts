// V2：数据集名称在空间内唯一（仅对未删除行生效），复刻 Java PO 注释里的 uk_space_name，
// 作为 Redis 锁之外的第二道防线（M1 决定 2）。逻辑删除的行不占名额，允许删后重建同名数据集。
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export async function up(db: AnyDb): Promise<void> {
  await sql
    .raw(
      `CREATE UNIQUE INDEX uk_dataset_space_name_active
         ON lingshu_dataset (space_code, dataset_name)
         WHERE deleted = 0`,
    )
    .execute(db);
}

export async function down(db: AnyDb): Promise<void> {
  await sql.raw(`DROP INDEX IF EXISTS uk_dataset_space_name_active`).execute(db);
}
