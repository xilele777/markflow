// 鉴权中间件（对应 Java AuthInterceptor）：Authorization: Bearer <jwt>；缺失 / 无效一律 UNAUTHORIZED（HTTP 401）。
// 与 Java 相同，这里只校验签名与过期，不查库检查用户禁用状态（getCurrentUser 会查；M5 用户禁用功能再统一处理）。
import type { Request, RequestHandler } from 'express';
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import { verifyToken, type TokenClaims } from '../../infra/jwt.js';
import { SYS_CONFIG_KEYS, type SysConfigService } from '../../infra/sys-config.js';

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

export function createAuthMiddleware(sysConfig: SysConfigService): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw ServiceError.of(CommonErrorCode.UNAUTHORIZED);
    }
    const secret = await sysConfig.get(SYS_CONFIG_KEYS.jwtSecret);
    req.user = verifyToken(header.slice(BEARER_PREFIX.length), secret);
    next();
  };
}

/** 路由内取当前用户；未经鉴权中间件的路由误用时抛 UNAUTHORIZED 而不是崩溃。 */
export function requireUser(req: Request): AuthUser {
  if (!req.user) throw ServiceError.of(CommonErrorCode.UNAUTHORIZED);
  return req.user;
}
