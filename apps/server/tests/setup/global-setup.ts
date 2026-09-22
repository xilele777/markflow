// 全局前置：重建 lingshu_test 的 public schema → 跑迁移 → 首启引导 → 清限流键 → 清测试前缀下的队列。只允许对 *_test 库执行。
import './env.js';
import { sql } from 'kysely';
import { createContext, destroyContext } from '../../src/app/context.js';
import { migrateToLatest } from '../../src/db/migrator.js';
import { runBootstrap } from '../../src/infra/bootstrap.js';
import { loadConfig } from '../../src/infra/config.js';
import { obliterateQueue, QUEUE_NAMES } from '../../src/infra/queue.js';

export default async function globalSetup(): Promise<void> {
  const config = loadConfig();
  if (!config.pg.database.endsWith('_test')) {
    throw new Error(`拒绝在非测试库上重建 schema：${config.pg.database}`);
  }
  if (!config.queue.prefix.endsWith('_test')) {
    throw new Error(`拒绝清理非测试前缀的队列：${config.queue.prefix}`);
  }
  const ctx = await createContext(config, { poolSize: 2 });
  try {
    await sql`DROP SCHEMA public CASCADE`.execute(ctx.db);
    await sql`CREATE SCHEMA public`.execute(ctx.db);
    await migrateToLatest(ctx.db, ctx.logger);
    await runBootstrap(ctx);
    const keys = await ctx.redis.keys('rl:*');
    if (keys.length > 0) await ctx.redis.del(...keys);
    for (const name of Object.values(QUEUE_NAMES)) {
      await obliterateQueue(config, name);
    }
  } finally {
    await destroyContext(ctx);
  }
}
