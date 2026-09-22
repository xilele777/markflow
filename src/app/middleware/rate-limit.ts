// Redis 固定窗口限流（移植自 LabelHub apiRateLimit 的思路，不依赖 express-rate-limit）。
// 超限 → TOO_MANY_REQUESTS（HTTP 429）+ Retry-After；Redis 不可用时放行并告警（fail-open）。
import type { Request, RequestHandler } from 'express';
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import type { Logger } from '../../infra/logger.js';
import type { Redis } from '../../infra/redis.js';

export interface RateLimitOptions {
  redis: Redis;
  logger: Logger;
  /** 键前缀：rl:<prefix>:<key> */
  prefix: string;
  windowSeconds: number;
  max: number;
  /** 返回 null 表示本请求不限流。 */
  keyOf: (req: Request) => string | null;
  message?: string;
}

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const { redis, logger, prefix, windowSeconds, max, keyOf, message } = options;
  return async (req, _res, next) => {
    const id = keyOf(req);
    if (id === null) {
      next();
      return;
    }
    const key = `rl:${prefix}:${id}`;
    let count: number;
    let ttl = windowSeconds;
    try {
      const results = await redis
        .multi()
        .incr(key)
        .expire(key, windowSeconds, 'NX')
        .ttl(key)
        .exec();
      count = Number(results?.[0]?.[1] ?? 0);
      const reportedTtl = Number(results?.[2]?.[1] ?? windowSeconds);
      if (reportedTtl > 0) ttl = reportedTtl;
    } catch (err) {
      logger.warn({ err, prefix }, 'rate limit store unavailable, fail-open');
      next();
      return;
    }
    if (count > max) {
      throw ServiceError.of(CommonErrorCode.TOO_MANY_REQUESTS, message, {
        headers: { 'Retry-After': String(ttl) },
      });
    }
    next();
  };
}
