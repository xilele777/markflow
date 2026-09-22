import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signToken } from '../src/infra/jwt.js';
import { SYS_CONFIG_KEYS } from '../src/infra/sys-config.js';
import { UserStatus } from '../src/modules/user/enums.js';
import { WorkspaceRole } from '../src/modules/workspace/enums.js';
import {
  ADMIN,
  addMember,
  createTestHarness,
  createUser,
  createWorkspace,
  loginToken,
  uniq,
  type TestHarness,
} from './helpers/app.js';

describe('GET /api/user/getCurrentUser', () => {
  let h: TestHarness;
  let secret: string;

  beforeAll(async () => {
    h = await createTestHarness();
    secret = await h.ctx.sysConfig.get(SYS_CONFIG_KEYS.jwtSecret);
  });
  afterAll(() => h.close());

  const get = (token?: string) => {
    const req = request(h.app).get('/api/user/getCurrentUser');
    return token === undefined ? req : req.set('Authorization', token);
  };

  it('无 Authorization → HTTP 401 UNAUTHORIZED', async () => {
    const res = await get();
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: 'UNAUTHORIZED', message: '未授权' });
  });

  it('非 Bearer 前缀 → 401', async () => {
    const res = await get('Token abc');
    expect(res.status).toBe(401);
  });

  it('签名不匹配 → 401', async () => {
    const token = signToken({ userId: 1, username: 'admin' }, 'another-secret-another-secret-123456', 60);
    const res = await get(`Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('已过期 → 401', async () => {
    const token = signToken({ userId: 1, username: 'admin' }, secret, -10);
    const res = await get(`Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('管理员：基本字段 + 空 workspaces', async () => {
    const token = await loginToken(h.app, ADMIN.username, ADMIN.password);
    const res = await get(`Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      username: 'admin',
      displayName: '系统管理员',
      isSystemAdmin: true,
      workspaces: [],
    });
    expect(typeof res.body.data.userId).toBe('number');
  });

  it('多空间多角色：按空间 ID 升序、角色按 code 升序、角色为枚举名', async () => {
    const username = uniq('multi');
    const userId = await createUser(h.ctx, { username, password: 'pass123456' });
    const codeA = uniq('wsa');
    const codeB = uniq('wsb');
    const wsA = await createWorkspace(h.ctx, { spaceCode: codeA, name: '空间 A' });
    const wsB = await createWorkspace(h.ctx, { spaceCode: codeB, name: '空间 B' });
    await addMember(h.ctx, wsB, userId, WorkspaceRole.REVIEWER);
    await addMember(h.ctx, wsA, userId, WorkspaceRole.LABEL_ADMIN);
    await addMember(h.ctx, wsA, userId, WorkspaceRole.LABELER);

    const token = await loginToken(h.app, username, 'pass123456');
    const res = await get(`Bearer ${token}`);
    expect(res.body.data).toEqual({
      userId,
      username,
      displayName: username,
      isSystemAdmin: false,
      workspaces: [
        { workspaceId: wsA, spaceCode: codeA, name: '空间 A', roles: ['LABELER', 'LABEL_ADMIN'] },
        { workspaceId: wsB, spaceCode: codeB, name: '空间 B', roles: ['REVIEWER'] },
      ],
    });
  });

  it('token 有效但账号已禁用 → HTTP 200 USER_DISABLED', async () => {
    const username = uniq('dis');
    const userId = await createUser(h.ctx, { username, password: 'pass123456' });
    const token = await loginToken(h.app, username, 'pass123456');
    await h.ctx.db
      .updateTable('sys_user')
      .set({ status: UserStatus.DISABLED })
      .where('id', '=', userId)
      .execute();
    const res = await get(`Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('USER_DISABLED');
  });

  it('token 指向不存在的用户 → USER_INVALID', async () => {
    const token = signToken({ userId: 999999999, username: 'ghost' }, secret, 60);
    const res = await get(`Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('USER_INVALID');
  });
});
