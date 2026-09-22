// Redis 分布式锁（对应 Java LockUtil / Redisson tryLock(wait, lease)）。
// SET NX PX 抢锁，轮询直到 wait 超时；解锁用 Lua 比对持有凭证后删除，只释放自己的锁。
// Redis 异常直接上抛（→ SYSTEM_ERROR），不 fail-open：锁保护的是写路径，宁可拒绝也不重复创建。
import { randomUUID } from 'node:crypto';
import { ServiceError, type ErrorCode } from './errors.js';
import type { Logger } from './logger.js';
import type { Redis } from './redis.js';

const POLL_INTERVAL_MS = 50;
const UNLOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export interface LockOptions {
  /** 抢锁最长等待毫秒数；0 表示只尝试一次。 */
  waitMs: number;
  /** 锁自动过期毫秒数（持有方崩溃时兜底）。 */
  leaseMs: number;
}

/** Java 各模块常量：wait 3s / lease 10s。 */
export const DEFAULT_LOCK_OPTIONS: LockOptions = { waitMs: 3_000, leaseMs: 10_000 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RedisLock {
  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  private static key(name: string): string {
    return `lock:${name}`;
  }

  /** 抢到锁返回持有凭证，超时返回 null。 */
  async tryLock(name: string, options: LockOptions = DEFAULT_LOCK_OPTIONS): Promise<string | null> {
    const token = randomUUID();
    const deadline = Date.now() + options.waitMs;
    for (;;) {
      const result = await this.redis.set(RedisLock.key(name), token, 'PX', options.leaseMs, 'NX');
      if (result === 'OK') return token;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      await sleep(Math.min(POLL_INTERVAL_MS, remaining));
    }
  }

  async unlock(name: string, token: string): Promise<void> {
    await this.redis.eval(UNLOCK_SCRIPT, 1, RedisLock.key(name), token);
  }

  /** 拿不到锁抛调用方指定的错误码（各模块 OPERATION_CONFLICT）；fn 结束后释放。 */
  async withLock<T>(
    name: string,
    conflict: ErrorCode,
    fn: () => Promise<T>,
    options: LockOptions = DEFAULT_LOCK_OPTIONS,
  ): Promise<T> {
    const token = await this.tryLock(name, options);
    if (token === null) throw ServiceError.of(conflict);
    try {
      return await fn();
    } finally {
      try {
        await this.unlock(name, token);
      } catch (err) {
        this.logger.warn({ err, lock: name }, 'unlock failed; lease will expire on its own');
      }
    }
  }
}
