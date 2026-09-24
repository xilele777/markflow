import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBootstrap } from '../src/infra/bootstrap.js';
import { ConfigError, loadConfig } from '../src/infra/config.js';
import { SYS_CONFIG_KEYS } from '../src/infra/sys-config.js';
import { createTestHarness, type TestHarness } from './helpers/app.js';

describe('配置与首启引导', () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await createTestHarness();
  });
  afterAll(() => h.close());

  it('缺少口令类环境变量 → ConfigError 列出缺失项', () => {
    expect(() => loadConfig({ MARKFLOW_REDIS_PASSWORD: 'x' })).toThrow(ConfigError);
    expect(() => loadConfig({ MARKFLOW_REDIS_PASSWORD: 'x' })).toThrow(/MARKFLOW_PG_PASSWORD/);
  });

  it('空字符串视为未设置', () => {
    expect(() => loadConfig({ MARKFLOW_PG_PASSWORD: '', MARKFLOW_REDIS_PASSWORD: 'x' })).toThrow(
      /MARKFLOW_PG_PASSWORD/,
    );
  });

  it('JWT 密钥过短 → ConfigError', () => {
    expect(() =>
      loadConfig({
        MARKFLOW_PG_PASSWORD: 'a',
        MARKFLOW_REDIS_PASSWORD: 'b',
        MARKFLOW_JWT_SECRET: 'short',
      }),
    ).toThrow(/MARKFLOW_JWT_SECRET/);
  });

  it('重复执行引导是幂等的：不改密钥、不重复建管理员', async () => {
    const secretBefore = await h.ctx.sysConfig.get(SYS_CONFIG_KEYS.jwtSecret);
    const result = await runBootstrap(h.ctx);
    expect(result).toEqual({
      jwtSecretWritten: false,
      jwtExpireWritten: false,
      adminCreated: false,
    });
    h.ctx.sysConfig.invalidate();
    expect(await h.ctx.sysConfig.get(SYS_CONFIG_KEYS.jwtSecret)).toBe(secretBefore);

    const admins = await h.ctx.db
      .selectFrom('sys_user')
      .select(({ fn }) => fn.countAll<number>().as('n'))
      .where('username', '=', 'admin')
      .executeTakeFirstOrThrow();
    expect(admins.n).toBe(1);
  });

  it('sys_config 已有 jwt.* 与管理员时，不需要引导环境变量也能启动', async () => {
    const config = loadConfig();
    const stripped = {
      ...config,
      bootstrap: { ...config.bootstrap, jwtSecret: undefined, adminInitialPassword: undefined },
    };
    await expect(runBootstrap({ ...h.ctx, config: stripped })).resolves.toEqual({
      jwtSecretWritten: false,
      jwtExpireWritten: false,
      adminCreated: false,
    });
  });
});
