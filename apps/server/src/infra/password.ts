// BCrypt（与 Java BCryptPasswordEncoder 兼容，$2a$ / $2b$ 均可校验）。
import { compare, hash } from 'bcryptjs';

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return compare(plain, passwordHash);
}
