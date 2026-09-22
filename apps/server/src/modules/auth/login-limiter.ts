// 登录失败限流（移植自 LabelHub loginRateLimit）：键 ip:username，窗口内失败达上限即拒绝；成功登录清零。
// Redis 不可用时放行并告警（fail-open）。
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import type { Logger } from '../../infra/logger.js';
import type { Redis } from '../../infra/redis.js';

export interface LoginAttemptLimiterOptions {
  maxFailures: number;
  windowSeconds: number;
}

export class LoginAttemptLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
    private readonly options: LoginAttemptLimiterOptions,
  ) {}

  private key(ip: string, username: string): string {
    return `rl:login:${ip}:${username.trim().toLowerCase()}`;
  }

  /** 已达上限 → TOO_MANY_REQUESTS（HTTP 429）+ Retry-After。 */
  async assertAllowed(ip: string, username: string): Promise<void> {
    const key = this.key(ip, username);
    let count: number;
    let ttl = this.options.windowSeconds;
    try {
      count = Number((await this.redis.get(key)) ?? 0);
      if (count >= this.options.maxFailures) {
        const reported = await this.redis.ttl(key);
        if (reported > 0) ttl = reported;
      }
    } catch (err) {
      this.logger.warn({ err }, 'login limiter store unavailable, fail-open');
      return;
    }
    if (count >= this.options.maxFailures) {
      throw ServiceError.of(CommonErrorCode.TOO_MANY_REQUESTS, '登录失败次数过多，请稍后再试', {
        headers: { 'Retry-After': String(ttl) },
      });
    }
  }

  async recordFailure(ip: string, username: string): Promise<void> {
    const key = this.key(ip, username);
    try {
      await this.redis.multi().incr(key).expire(key, this.options.windowSeconds, 'NX').exec();
    } catch (err) {
      this.logger.warn({ err }, 'login limiter recordFailure failed');
    }
  }

  async reset(ip: string, username: string): Promise<void> {
    try {
      await this.redis.del(this.key(ip, username));
    } catch (err) {
      this.logger.warn({ err }, 'login limiter reset failed');
    }
  }
}
