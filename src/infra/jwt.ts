// JWT：HS256，claims 与 Java JwtUtil 一致（userId、username、exp）。
import jwt from 'jsonwebtoken';
import { CommonErrorCode, ServiceError } from './errors.js';

export interface TokenClaims {
  userId: number;
  username: string;
}

export function signToken(claims: TokenClaims, secret: string, expireSeconds: number): string {
  return jwt.sign({ userId: claims.userId, username: claims.username }, secret, {
    algorithm: 'HS256',
    expiresIn: expireSeconds,
  });
}

/** 解析失败（签名错 / 过期 / 格式错）一律 UNAUTHORIZED。 */
export function verifyToken(token: string, secret: string): TokenClaims {
  let payload: unknown;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    throw ServiceError.of(CommonErrorCode.UNAUTHORIZED);
  }
  if (typeof payload !== 'object' || payload === null) {
    throw ServiceError.of(CommonErrorCode.UNAUTHORIZED);
  }
  const { userId, username } = payload as Record<string, unknown>;
  if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || typeof username !== 'string') {
    throw ServiceError.of(CommonErrorCode.UNAUTHORIZED);
  }
  return { userId, username };
}
