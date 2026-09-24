// 首启引导（幂等）：sys_config 缺 jwt.secret / jwt.expireSeconds 时从环境变量写入；
// 管理员账号不存在时用 MARKFLOW_ADMIN_INITIAL_PASSWORD 创建。已存在的记录一律不动。
import type { AppConfig } from './config.js';
import type { Db } from './db.js';
import type { Logger } from './logger.js';
import { hashPassword } from './password.js';
import { SYS_CONFIG_KEYS, SysConfigType, type SysConfigService } from './sys-config.js';
import { UserStatus } from '../modules/user/enums.js';

export const BOOTSTRAP_OPERATOR = 'SYSTEM_BOOTSTRAP';

export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapError';
  }
}

export interface BootstrapDeps {
  config: AppConfig;
  db: Db;
  sysConfig: SysConfigService;
  logger: Logger;
}

export interface BootstrapResult {
  jwtSecretWritten: boolean;
  jwtExpireWritten: boolean;
  adminCreated: boolean;
}

export async function runBootstrap(deps: BootstrapDeps): Promise<BootstrapResult> {
  const { config, db, sysConfig, logger } = deps;
  const result: BootstrapResult = {
    jwtSecretWritten: false,
    jwtExpireWritten: false,
    adminCreated: false,
  };

  if ((await sysConfig.getOrNull(SYS_CONFIG_KEYS.jwtSecret)) === null) {
    if (!config.bootstrap.jwtSecret) {
      throw new BootstrapError(
        'sys_config 缺少 jwt.secret，且未提供 MARKFLOW_JWT_SECRET（首次启动必填，至少 32 字符）',
      );
    }
    await sysConfig.saveOrUpdate(
      SYS_CONFIG_KEYS.jwtSecret,
      'JWT 签名密钥',
      SysConfigType.STRING,
      config.bootstrap.jwtSecret,
      BOOTSTRAP_OPERATOR,
    );
    result.jwtSecretWritten = true;
    logger.info('bootstrap: 已写入 sys_config.jwt.secret');
  }

  if ((await sysConfig.getOrNull(SYS_CONFIG_KEYS.jwtExpireSeconds)) === null) {
    await sysConfig.saveOrUpdate(
      SYS_CONFIG_KEYS.jwtExpireSeconds,
      'JWT 过期秒数',
      SysConfigType.STRING,
      String(config.bootstrap.jwtExpireSeconds),
      BOOTSTRAP_OPERATOR,
    );
    result.jwtExpireWritten = true;
    logger.info(
      { expireSeconds: config.bootstrap.jwtExpireSeconds },
      'bootstrap: 已写入 sys_config.jwt.expireSeconds',
    );
  }

  const adminUsername = config.bootstrap.adminUsername;
  const existingAdmin = await db
    .selectFrom('sys_user')
    .select('id')
    .where('username', '=', adminUsername)
    .executeTakeFirst();
  if (!existingAdmin) {
    if (!config.bootstrap.adminInitialPassword) {
      throw new BootstrapError(
        `sys_user 不存在 ${adminUsername}，且未提供 MARKFLOW_ADMIN_INITIAL_PASSWORD（首次启动必填）`,
      );
    }
    const now = Date.now();
    await db
      .insertInto('sys_user')
      .values({
        username: adminUsername,
        displayName: '系统管理员',
        passwordHash: await hashPassword(config.bootstrap.adminInitialPassword),
        isSystemAdmin: true,
        status: UserStatus.NORMAL,
        creator: BOOTSTRAP_OPERATOR,
        operator: BOOTSTRAP_OPERATOR,
        createTime: now,
        updateTime: now,
      })
      .execute();
    result.adminCreated = true;
    logger.info({ username: adminUsername }, 'bootstrap: 已创建系统管理员');
  }

  return result;
}
