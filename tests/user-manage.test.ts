import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserStatus } from '../src/modules/user/enums.js';
import {
  adminToken,
  bearer,
  createTestHarness,
  createUser,
  createUserAndLogin,
  DEFAULT_PASSWORD,
  login,
  loginToken,
  uniq,
  type LoggedInUser,
  type TestHarness,
} from './helpers/app.js';

describe('/api/user 用户管理', () => {
  let h: TestHarness;
  let admin: string;
  let labeler: LoggedInUser;

  beforeAll(async () => {
    h = await createTestHarness();
    admin = await adminToken(h.app);
    labeler = await createUserAndLogin(h.ctx, h.app, 'ulab');
  });
  afterAll(() => h.close());

  const post = (path: string, token: string, body: object) =>
    request(h.app).post(path).set('Authorization', bearer(token)).send(body);

  describe('POST /create', () => {
    it('非系统管理员 → HTTP 403 PERMISSION_DENIED', async () => {
      const res = await post('/api/user/create', labeler.token, {
        username: uniq('x'),
        displayName: 'x',
        password: DEFAULT_PASSWORD,
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('参数校验顺序与文案：username 4-10 → password ≥ 6 → displayName 非空', async () => {
      const short = await post('/api/user/create', admin, {
        username: 'abc',
        displayName: 'x',
        password: DEFAULT_PASSWORD,
      });
      expect(short.body).toMatchObject({
        code: 'INVALID_PARAM',
        message: 'username 长度需为 4-10 位',
      });
      const long = await post('/api/user/create', admin, {
        username: 'abcdefghijk',
        displayName: 'x',
        password: DEFAULT_PASSWORD,
      });
      expect(long.body.message).toBe('username 长度需为 4-10 位');
      const pwd = await post('/api/user/create', admin, {
        username: uniq('p'),
        displayName: 'x',
        password: '12345',
      });
      expect(pwd.body).toMatchObject({ code: 'INVALID_PARAM', message: 'password 长度需 >= 6 位' });
      const dn = await post('/api/user/create', admin, {
        username: uniq('d'),
        displayName: '  ',
        password: DEFAULT_PASSWORD,
      });
      expect(dn.body).toMatchObject({ code: 'INVALID_PARAM', message: 'displayName 不能为空' });
    });

    it('字段类型错误 → PARAM_INVALID', async () => {
      const res = await post('/api/user/create', admin, {
        username: 123,
        displayName: 'x',
        password: DEFAULT_PASSWORD,
      });
      expect(res.body.code).toBe('PARAM_INVALID');
    });

    it('创建成功 → {userId}，新用户可登录；isSystemAdmin 缺省为 false', async () => {
      const username = uniq('new');
      const res = await post('/api/user/create', admin, {
        username,
        displayName: '新用户',
        password: 'secret1',
      });
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.userId).toBe('number');
      const token = await loginToken(h.app, username, 'secret1');
      const me = await request(h.app)
        .get('/api/user/getCurrentUser')
        .set('Authorization', bearer(token));
      expect(me.body.data).toMatchObject({ username, displayName: '新用户', isSystemAdmin: false });
      const row = await h.ctx.db
        .selectFrom('sys_user')
        .selectAll()
        .where('id', '=', res.body.data.userId)
        .executeTakeFirstOrThrow();
      expect(row).toMatchObject({ status: UserStatus.NORMAL, creator: 'admin', operator: 'admin' });
      expect(row.passwordHash).not.toContain('secret1');
    });

    it('isSystemAdmin=true 创建管理员', async () => {
      const username = uniq('adm');
      await post('/api/user/create', admin, {
        username,
        displayName: '管理员',
        password: 'secret1',
        isSystemAdmin: true,
      });
      const token = await loginToken(h.app, username, 'secret1');
      const me = await request(h.app)
        .get('/api/user/getCurrentUser')
        .set('Authorization', bearer(token));
      expect(me.body.data.isSystemAdmin).toBe(true);
    });

    it('用户名重复（大小写不敏感）→ USERNAME_EXISTS', async () => {
      const username = uniq('dup');
      expect(
        (await post('/api/user/create', admin, { username, displayName: 'a', password: 'secret1' }))
          .body.success,
      ).toBe(true);
      const res = await post('/api/user/create', admin, {
        username: username.toUpperCase(),
        displayName: 'b',
        password: 'secret1',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ code: 'USERNAME_EXISTS', message: '用户名已存在' });
    });
  });

  describe('POST /getUserList', () => {
    it('非系统管理员 → 403', async () => {
      const res = await post('/api/user/getUserList', labeler.token, {});
      expect(res.status).toBe(403);
    });

    it('默认分页 pageNum=1 / pageSize=20，顶层带 total；条目字段完整', async () => {
      const res = await post('/api/user/getUserList', admin, {});
      expect(res.body).toMatchObject({ success: true, pageNum: 1, pageSize: 20 });
      expect(res.body.total).toBeGreaterThan(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      const first = res.body.data[0];
      expect(Object.keys(first).sort()).toEqual(
        ['createTime', 'displayName', 'isSystemAdmin', 'status', 'userId', 'username'].sort(),
      );
    });

    it('keyword 模糊匹配 username / displayName（大小写不敏感）；按创建时间倒序', async () => {
      const base = uniq('ul').slice(0, 8);
      const a = await createUser(h.ctx, { username: `${base}a`, password: DEFAULT_PASSWORD });
      await new Promise((r) => setTimeout(r, 5));
      const b = await createUser(h.ctx, { username: `${base}b`, password: DEFAULT_PASSWORD });
      const byName = await post('/api/user/getUserList', admin, { keyword: base.toUpperCase() });
      expect(byName.body.total).toBe(2);
      expect(byName.body.data.map((u: { userId: number }) => u.userId)).toEqual([b, a]);

      const displayName = `显示名${Date.now()}`;
      const c = await createUser(h.ctx, {
        username: uniq('dn'),
        password: DEFAULT_PASSWORD,
        displayName,
      });
      const byDisplay = await post('/api/user/getUserList', admin, {
        keyword: displayName.slice(0, 8),
      });
      expect(byDisplay.body.data.map((u: { userId: number }) => u.userId)).toEqual([c]);
    });

    it('LIKE 通配符按字面匹配', async () => {
      const res = await post('/api/user/getUserList', admin, { keyword: '%' });
      expect(res.body.success).toBe(true);
      expect(res.body.total).toBe(0);
    });

    it('分页参数越界 → PARAM_INVALID', async () => {
      expect((await post('/api/user/getUserList', admin, { pageNum: 0 })).body).toMatchObject({
        code: 'PARAM_INVALID',
        message: 'pageNum 需 >= 1',
      });
      expect((await post('/api/user/getUserList', admin, { pageSize: 101 })).body).toMatchObject({
        code: 'PARAM_INVALID',
        message: 'pageSize 需在 1-100 之间',
      });
      expect((await post('/api/user/getUserList', admin, { pageSize: 0 })).body.code).toBe(
        'PARAM_INVALID',
      );
    });

    it('pageSize=1 时 total 不变、data 长度为 1', async () => {
      const res = await post('/api/user/getUserList', admin, { pageNum: 1, pageSize: 1 });
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBeGreaterThan(1);
      expect(res.body.pageSize).toBe(1);
    });
  });

  describe('POST /changePassword', () => {
    it('oldPassword 空白 → INVALID_PARAM', async () => {
      const res = await post('/api/user/changePassword', labeler.token, {
        oldPassword: ' ',
        newPassword: 'newpass1',
      });
      expect(res.body).toMatchObject({ code: 'INVALID_PARAM', message: 'oldPassword 不能为空' });
    });

    it('newPassword 短于 6 → INVALID_PARAM', async () => {
      const res = await post('/api/user/changePassword', labeler.token, {
        oldPassword: DEFAULT_PASSWORD,
        newPassword: '12345',
      });
      expect(res.body).toMatchObject({
        code: 'INVALID_PARAM',
        message: 'newPassword 长度需 >= 6 位',
      });
    });

    it('原密码错误 → WRONG_PASSWORD', async () => {
      const res = await post('/api/user/changePassword', labeler.token, {
        oldPassword: 'nope-nope',
        newPassword: 'newpass1',
      });
      expect(res.body).toMatchObject({ code: 'WRONG_PASSWORD', message: '原密码错误' });
    });

    it('成功后旧密码失效、新密码可登录；operator 记为本人', async () => {
      const user = await createUserAndLogin(h.ctx, h.app, 'cpw');
      const res = await post('/api/user/changePassword', user.token, {
        oldPassword: DEFAULT_PASSWORD,
        newPassword: 'brandnew1',
      });
      expect(res.body).toMatchObject({ success: true, data: null });
      expect((await login(h.app, user.username, DEFAULT_PASSWORD)).body.code).toBe('LOGIN_FAILED');
      expect((await login(h.app, user.username, 'brandnew1')).body.success).toBe(true);
      const row = await h.ctx.db
        .selectFrom('sys_user')
        .select('operator')
        .where('id', '=', user.userId)
        .executeTakeFirstOrThrow();
      expect(row.operator).toBe(user.username);
    });

    it('已禁用用户 → USER_DISABLED', async () => {
      const user = await createUserAndLogin(h.ctx, h.app, 'dis');
      await h.ctx.db
        .updateTable('sys_user')
        .set({ status: UserStatus.DISABLED })
        .where('id', '=', user.userId)
        .execute();
      const res = await post('/api/user/changePassword', user.token, {
        oldPassword: DEFAULT_PASSWORD,
        newPassword: 'newpass1',
      });
      expect(res.body.code).toBe('USER_DISABLED');
    });
  });
});
