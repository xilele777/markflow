// 应用上下文：配置、日志、DB、Redis、sys_config 服务、分布式锁、加密盒、对象存储、队列生产者、发件箱。
// 路由/服务通过它拿依赖，不用全局单例。消费者 Worker 不在这里（见 app/workers.ts），测试可按需启动。
import type { AppConfig } from '../infra/config.js';
import { createDb, type Db } from '../infra/db.js';
import { RedisLock } from '../infra/lock.js';
import { createLogger, type Logger } from '../infra/logger.js';
import { ObjectStorage } from '../infra/object-storage.js';
import { OutboxService } from '../infra/outbox.js';
import { createQueues, type Queues } from '../infra/queue.js';
import { createRedis, type Redis } from '../infra/redis.js';
import { SecretBox } from '../infra/secret-box.js';
import { SysConfigService } from '../infra/sys-config.js';
import { Metrics } from '../infra/metrics.js';

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  db: Db;
  redis: Redis;
  sysConfig: SysConfigService;
  lock: RedisLock;
  secretBox: SecretBox;
  storage: ObjectStorage;
  queues: Queues;
  /** 事务性发件箱：业务事务内落行、提交后投递。 */
  outbox: OutboxService;
  metrics: Metrics;
}

export interface CreateContextOptions {
  logger?: Logger;
  poolSize?: number;
}

export async function createContext(
  config: AppConfig,
  options: CreateContextOptions = {},
): Promise<AppContext> {
  const logger =
    options.logger ?? createLogger(config.server.logLevel, process.stdout.isTTY === true);
  const db = createDb(config.pg, options.poolSize);
  const redis = createRedis(config.redis);
  redis.on('error', (err) => logger.warn({ err }, 'redis error'));
  await redis.connect();
  const queues = createQueues(config);
  return {
    config,
    logger,
    db,
    redis,
    sysConfig: new SysConfigService(db),
    lock: new RedisLock(redis, logger),
    secretBox: new SecretBox(config.security.configEncKey),
    storage: new ObjectStorage(config.storage),
    queues,
    outbox: new OutboxService({ db, queues, logger }),
    metrics: new Metrics(),
  };
}

export async function destroyContext(ctx: AppContext): Promise<void> {
  ctx.metrics.registry.clear();
  try {
    await ctx.queues.closeAll();
  } catch (err) {
    ctx.logger.warn({ err }, 'closing queues failed');
  }
  ctx.storage.destroy();
  await ctx.db.destroy();
  try {
    await ctx.redis.quit();
  } catch {
    ctx.redis.disconnect();
  }
}
