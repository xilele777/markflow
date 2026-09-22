// 鉴权中间件（对应 Java AuthInterceptor）：Authorization: Bearer <jwt>；缺失 / 无效一律 UNAUTHORIZED（HTTP 401）。
// 与 Java 的差异（M5）：校验签名与过期后再查库，用户不存在或已禁用同样 401（禁用即时生效，不等 token 过期）。
// 查库结果按用户缓存 STATUS_CACHE_TTL_MS，避免每请求一次查询；禁用后最多延迟这么久生效。
import type { Request, RequestHandler } from 'express';
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import { verifyToken, type TokenClaims } from '../../infra/jwt.js';
import { SYS_CONFIG_KEYS, type SysConfigService } from '../../infra/sys-config.js';
import { UserStatus } from '../../modules/user/enums.js';
import type { UserRepository } from '../../modules/user/user.repo.js';

const STATUS_CACHE_TTL_MS = 10_000;
const STATUS_CACHE_MAX = 10_000;

/** 用户启用态缓存：进程内、按 userId、TTL 过期；改状态的服务调用 invalidate 让本进程立即生效。 */
export class UserStatusCache {
  private readonly entries = new Map<number, { active: boolean; expiresAt: number }>();

  constructor(private readonly ttlMs = STATUS_CACHE_TTL_MS) {}

  get(userId: number, now = Date.now()): boolean | undefined {
    const cached = this.entries.get(userId);
    if (!cached) return undefined;
    if (cached.expiresAt <= now) {
      this.entries.delete(userId);
      return undefined;
    }
    return cached.active;
  }

  set(userId: number, active: boolean, now = Date.now()): void {
    if (this.entries.size >= STATUS_CACHE_MAX) this.entries.clear();
    this.entries.set(userId, { active, expiresAt: now + this.ttlMs });
  }

  invalidate(userId: number): void {
    this.entries.delete(userId);
  }
}

export type AuthUser = TokenClaims;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const BEARER_PREFIX = 'Bearer ';

export function createAuthMiddleware(
  sysConfig: SysConfigService,
  users: UserRepository,
  statusCache: UserStatusCache = new UserStatusCache(),
): RequestHandler {
  const isActive = async (userId: number): Promise<boolean> => {
    const cached = statusCache.get(userId);
    if (cached !== undefined) return cached;
    const user = await users.selectById(userId);
    const active = user !== undefined && user.status !== UserStatus.DISABLED;
    statusCache.set(userId, active);
    return active;
  };
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw ServiceError.of(CommonErrorCode.UNAUTHORIZED);
    }
    const secret = await sysConfig.get(SYS_CONFIG_KEYS.jwtSecret);
    const claims = verifyToken(header.slice(BEARER_PREFIX.length), secret);
    if (!(await isActive(claims.userId))) {
      throw ServiceError.of(CommonErrorCode.UNAUTHORIZED, '账号已被禁用或不存在');
    }
    req.user = claims;
    next();
  };
}

/** 路由内取当前用户；未经鉴权中间件的路由误用时抛 UNAUTHORIZED 而不是崩溃。 */
export function requireUser(req: Request): AuthUser {
  if (!req.user) throw ServiceError.of(CommonErrorCode.UNAUTHORIZED);
  return req.user;
}
