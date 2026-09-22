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
