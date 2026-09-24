// V6：项目改名，只重命名表、序列与索引，不重建数据，保留主键和业务引用。
// V1/V2 保留已执行的原始表名；全新安装和已有数据库都经本迁移升级。
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

const LEGACY_PREFIX = 'lingshu_';
const CURRENT_PREFIX = 'markflow_';

async function renameRelations(db: AnyDb, from: string, to: string): Promise<void> {
  const { rows } = await sql<{ name: string; kind: string }>`
    SELECT c.relname AS name, c.relkind AS kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND starts_with(c.relname, ${from})
      AND c.relkind IN ('r', 'S', 'i')
    ORDER BY c.relkind, c.relname
  `.execute(db);
  for (const row of rows) {
    const kind = row.kind === 'r' ? 'TABLE' : row.kind === 'S' ? 'SEQUENCE' : 'INDEX';
    const target = to + row.name.slice(from.length);
    await sql`ALTER ${sql.raw(kind)} ${sql.id(row.name)} RENAME TO ${sql.id(target)}`.execute(db);
  }
}

export async function up(db: AnyDb): Promise<void> {
  await renameRelations(db, LEGACY_PREFIX, CURRENT_PREFIX);
}

export async function down(db: AnyDb): Promise<void> {
  await renameRelations(db, CURRENT_PREFIX, LEGACY_PREFIX);
}
