import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserStatus } from '../src/modules/user/enums.js';
import { ADMIN, createTestHarness, createUser, login, uniq, type TestHarness } from './helpers/app.js';

describe('POST /api/auth/login', () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await createTestHarness();
  });
  afterAll(() => h.close());

  it('正确账号密码 → success + JWT', async () => {
    const res = await login(h.app, ADMIN.username, ADMIN.password);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, code: 'SUCCESS' });
    expect(typeof res.body.timestamp).toBe('number');
    expect(res.body.data.token.split('.')).toHaveLength(3);
  });

  it('用户名大小写不敏感（复刻 MySQL general_ci）', async () => {
    const res = await login(h.app, 'ADMIN', ADMIN.password);
    expect(res.body.success).toBe(true);
  });

  it('密码错误 → HTTP 200 + LOGIN_FAILED', async () => {
    const res = await login(h.app, ADMIN.username, 'wrong-password');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: false,
      code: 'LOGIN_FAILED',
      message: '用户名或密码错误',
      data: null,
    });
  });

  it('用户不存在 → LOGIN_FAILED（与密码错误不可区分）', async () => {
    const res = await login(h.app, uniq('nobody'), 'whatever');
    expect(res.body.code).toBe('LOGIN_FAILED');
  });

  it('username 为空白 → INVALID_PARAM', async () => {
    const res = await login(h.app, '   ', 'x');
    expect(res.body).toMatchObject({ code: 'INVALID_PARAM', message: 'username 不能为空' });
  });

  it('缺少 password → INVALID_PARAM', async () => {
    const res = await request(h.app).post('/api/auth/login').send({ username: 'admin' });
    expect(res.body).toMatchObject({ code: 'INVALID_PARAM', message: 'password 不能为空' });
  });

  it('字段类型错误 → PARAM_INVALID', async () => {
    const res = await login(h.app, 123, 'x');
    expect(res.body.code).toBe('PARAM_INVALID');
    expect(res.body.message).toContain('username');
  });

  it('非法 JSON → PARAM_INVALID', async () => {
    const res = await request(h.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username": ');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('PARAM_INVALID');
  });

  it('禁用账号 → USER_DISABLED', async () => {
    const username = uniq('dis');
    await createUser(h.ctx, { username, password: 'pass123456', status: UserStatus.DISABLED });
    const res = await login(h.app, username, 'pass123456');
    expect(res.body).toMatchObject({ code: 'USER_DISABLED', message: '账号已被禁用' });
  });

  it('连续失败达上限 → HTTP 429 TOO_MANY_REQUESTS + Retry-After；即使密码正确也被拒', async () => {
    const username = uniq('rl');
    await createUser(h.ctx, { username, password: 'pass123456' });
    for (let i = 0; i < 3; i += 1) {
      const res = await login(h.app, username, 'bad');
      expect(res.body.code).toBe('LOGIN_FAILED');
    }
    const blocked = await login(h.app, username, 'pass123456');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('成功登录清零失败计数', async () => {
    const username = uniq('ok');
    await createUser(h.ctx, { username, password: 'pass123456' });
    await login(h.app, username, 'bad');
    await login(h.app, username, 'bad');
    expect((await login(h.app, username, 'pass123456')).body.success).toBe(true);
    await login(h.app, username, 'bad');
    await login(h.app, username, 'bad');
    expect((await login(h.app, username, 'pass123456')).body.success).toBe(true);
  });
});
