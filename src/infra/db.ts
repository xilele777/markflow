// Kysely + pg。列名 snake_case ↔ 属性 camelCase 由 CamelCasePlugin 转换；表名保持 snake_case。
import pg from 'pg';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../db/schema.js';
import type { AppConfig } from './config.js';

// int8（ID / 毫秒时间戳 / COUNT）统一转 number：规划约定 ID 保持在 2^53 以内。
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export type Db = Kysely<Database>;

export function createDb(cfg: AppConfig['pg'], poolSize = 10): Db {
  const pool = new pg.Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    max: poolSize,
  });
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });
}

const UNIQUE_VIOLATION = '23505';

/** PostgreSQL 唯一约束冲突（SQLSTATE 23505）；给出约束名时须一致。锁之外的第二道防线。 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; constraint?: unknown };
  return e.code === UNIQUE_VIOLATION && (constraint === undefined || e.constraint === constraint);
}
