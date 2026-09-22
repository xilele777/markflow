// 登录（对应 Java AuthDomainServiceImpl.login，规则见后端索引 §7.1）：
// validateParam(空 → INVALID_PARAM) → authenticate(用户不存在或密码错 → LOGIN_FAILED；禁用 → USER_DISABLED)
// → 用 sys_config 的 jwt.secret / jwt.expireSeconds 签发 token。
// 新增：登录失败限流（LabelHub 资产）；用户不存在时也做一次 bcrypt 比较，避免响应时间泄露账号是否存在。
import { randomUUID } from 'node:crypto';
import type { SysUserRow } from '../../db/schema.js';
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import { signToken } from '../../infra/jwt.js';
import { hashPassword, verifyPassword } from '../../infra/password.js';
import { SYS_CONFIG_KEYS, type SysConfigService } from '../../infra/sys-config.js';
import { UserStatus } from '../user/enums.js';
import { UserErrorCode } from '../user/error-codes.js';
import type { UserRepository } from '../user/user.repo.js';
import type { LoginAttemptLimiter } from './login-limiter.js';

export interface LoginInput {
  username?: unknown;
  password?: unknown;
}

export interface LoginResult {
  token: string;
}

export interface AuthServiceDeps {
  users: UserRepository;
  sysConfig: SysConfigService;
  limiter: LoginAttemptLimiter;
}

const dummyHash = hashPassword(randomUUID());

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async login(input: LoginInput, clientIp: string): Promise<LoginResult> {
    const { username, password } = validateParam(input);
    await this.deps.limiter.assertAllowed(clientIp, username);
    const user = await this.authenticate(username, password, clientIp);
    await this.deps.limiter.reset(clientIp, username);
    return { token: await this.generateToken(user) };
  }

  private async authenticate(
    username: string,
    password: string,
    clientIp: string,
  ): Promise<SysUserRow> {
    const user = await this.deps.users.selectByUsername(username);
    const matched = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !matched) {
      await this.deps.limiter.recordFailure(clientIp, username);
      throw ServiceError.of(UserErrorCode.LOGIN_FAILED);
    }
    if (user.status === UserStatus.DISABLED) {
      throw ServiceError.of(UserErrorCode.USER_DISABLED);
    }
    return user;
  }

  private async generateToken(user: SysUserRow): Promise<string> {
    const secret = await this.deps.sysConfig.get(SYS_CONFIG_KEYS.jwtSecret);
    const expireRaw = await this.deps.sysConfig.get(SYS_CONFIG_KEYS.jwtExpireSeconds);
    const expireSeconds = Number.parseInt(expireRaw, 10);
    if (!Number.isSafeInteger(expireSeconds) || expireSeconds <= 0) {
      throw ServiceError.of(
        CommonErrorCode.SYSTEM_ERROR,
        `系统配置 ${SYS_CONFIG_KEYS.jwtExpireSeconds} 不是合法正整数`,
      );
    }
    return signToken({ userId: user.id, username: user.username }, secret, expireSeconds);
  }
}

function validateParam(input: LoginInput): { username: string; password: string } {
  if (typeof input.username !== 'string' || input.username.trim() === '') {
    throw ServiceError.of(UserErrorCode.INVALID_PARAM, 'username 不能为空');
  }
  if (typeof input.password !== 'string' || input.password.trim() === '') {
    throw ServiceError.of(UserErrorCode.INVALID_PARAM, 'password 不能为空');
  }
  return { username: input.username, password: input.password };
}
