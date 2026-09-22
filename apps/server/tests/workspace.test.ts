import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserStatus } from '../src/modules/user/enums.js';
import { WorkspaceRole } from '../src/modules/workspace/enums.js';
import {
  addMember,
  adminToken,
  bearer,
  createTestHarness,
  createUser,
  createUserAndLogin,
  createWorkspace,
  DEFAULT_PASSWORD,
  uniq,
  type LoggedInUser,
  type TestHarness,
} from './helpers/app.js';

describe('/api/workspace', () => {
  let h: TestHarness;
  let admin: string;
  let labeler: LoggedInUser;

  beforeAll(async () => {
    h = await createTestHarness();
    admin = await adminToken(h.app);
    labeler = await createUserAndLogin(h.ctx, h.app, 'wlab');
  });
  afterAll(() => h.close());

  const post = (path: string, token: string, body: object) =>
    request(h.app).post(path).set('Authorization', bearer(token)).send(body);

  describe('POST /createWorkspace', () => {
    it('非系统管理员 → 403', async () => {
      const res = await post('/api/workspace/createWorkspace', labeler.token, {
        spaceCode: uniq('ws'),
        name: '空间名称',
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('spaceCode 不符合 ^[a-z0-9_-]{4,32}$ → SPACE_CODE_INVALID', async () => {
      for (const spaceCode of ['abc', 'ABCD', 'has space', 'a'.repeat(33), undefined]) {
        const res = await post('/api/workspace/createWorkspace', admin, {
          spaceCode,
          name: '空间名称',
        });
        expect(res.body).toMatchObject({ code: 'SPACE_CODE_INVALID', message: '空间编码不合法' });
      }
    });

    it('name 长度不在 4-32 → NAME_INVALID', async () => {
      expect(
        (
          await post('/api/workspace/createWorkspace', admin, {
            spaceCode: uniq('ws'),
            name: 'abc',
          })
        ).body.code,
      ).toBe('NAME_INVALID');
      expect(
        (
          await post('/api/workspace/createWorkspace', admin, {
            spaceCode: uniq('ws'),
            name: 'x'.repeat(33),
          })
        ).body.code,
      ).toBe('NAME_INVALID');
    });

    it('创建成功 → {workspaceId}；description 可省略；重复编码（大小写不敏感）→ SPACE_CODE_EXISTS', async () => {
      const spaceCode = uniq('ws');
      const res = await post('/api/workspace/createWorkspace', admin, {
        spaceCode,
        name: '测试空间',
      });
      expect(res.body.success).toBe(true);
      const row = await h.ctx.db
        .selectFrom('workspace')
        .selectAll()
        .where('id', '=', res.body.data.workspaceId)
        .executeTakeFirstOrThrow();
      expect(row).toMatchObject({
        spaceCode,
        name: '测试空间',
        description: null,
        creator: 'admin',
      });

      const dup = await post('/api/workspace/createWorkspace', admin, {
        spaceCode,
        name: '另一个空间',
      });
      expect(dup.body.code).toBe('SPACE_CODE_EXISTS');
    });
  });

  describe('POST /getWorkspaceList', () => {
    it('系统管理员看全部；keyword 匹配 spaceCode 或 name', async () => {
      const code = uniq('lst');
      const id = await createWorkspace(h.ctx, { spaceCode: code, name: `列表空间${code}` });
      const all = await post('/api/workspace/getWorkspaceList', admin, {});
      expect(all.body.total).toBeGreaterThanOrEqual(1);
      expect(all.body).toMatchObject({ pageNum: 1, pageSize: 20 });

      const byCode = await post('/api/workspace/getWorkspaceList', admin, { keyword: code });
      expect(byCode.body.data.map((w: { workspaceId: number }) => w.workspaceId)).toEqual([id]);
      expect(Object.keys(byCode.body.data[0]).sort()).toEqual([
        'createTime',
        'description',
        'name',
        'spaceCode',
        'workspaceId',
      ]);
      const byName = await post('/api/workspace/getWorkspaceList', admin, {
        keyword: `列表空间${code}`,
      });
      expect(byName.body.total).toBe(1);
    });

    it('普通用户只看自己所属空间（多角色不重复）；无所属 → 空页', async () => {
      const user = await createUserAndLogin(h.ctx, h.app, 'own');
      const none = await post('/api/workspace/getWorkspaceList', user.token, {});
      expect(none.body).toMatchObject({ success: true, total: 0, data: [] });

      const mine = await createWorkspace(h.ctx, { spaceCode: uniq('my'), name: '我的空间' });
      await createWorkspace(h.ctx, { spaceCode: uniq('oth'), name: '别人的空间' });
      await addMember(h.ctx, mine, user.userId, WorkspaceRole.LABELER);
      await addMember(h.ctx, mine, user.userId, WorkspaceRole.REVIEWER);
      const res = await post('/api/workspace/getWorkspaceList', user.token, {});
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].workspaceId).toBe(mine);
    });

    it('pageNum < 1 → PARAM_INVALID', async () => {
      expect(
        (await post('/api/workspace/getWorkspaceList', admin, { pageNum: -1 })).body.code,
      ).toBe('PARAM_INVALID');
    });
  });

  describe('POST /addWorkspaceMember', () => {
    it('role code 非法 → PARAM_INVALID（边界校验，先于权限）', async () => {
      const res = await post('/api/workspace/addWorkspaceMember', labeler.token, {
        workspaceId: 1,
        members: [{ userId: 1, roles: [9] }],
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ code: 'PARAM_INVALID', message: 'role 不合法: 9' });
    });

    it('缺 workspaceId → PARAM_INVALID；空间不存在 → WORKSPACE_NOT_FOUND', async () => {
      expect(
        (await post('/api/workspace/addWorkspaceMember', admin, { members: [] })).body.code,
      ).toBe('PARAM_INVALID');
      const res = await post('/api/workspace/addWorkspaceMember', admin, {
        workspaceId: 999999999,
        members: [],
      });
      expect(res.body.code).toBe('WORKSPACE_NOT_FOUND');
    });

    it('权限：系统管理员 / 本空间 LABEL_ADMIN 可加；其他角色 → 403', async () => {
      const ws = await createWorkspace(h.ctx, { spaceCode: uniq('perm'), name: '权限空间' });
      const labelAdmin = await createUserAndLogin(h.ctx, h.app, 'ladm');
      await addMember(h.ctx, ws, labelAdmin.userId, WorkspaceRole.LABEL_ADMIN);
      const target = await createUser(h.ctx, { username: uniq('tgt'), password: DEFAULT_PASSWORD });

      const denied = await post('/api/workspace/addWorkspaceMember', labeler.token, {
        workspaceId: ws,
        members: [{ userId: target, roles: [WorkspaceRole.LABELER] }],
      });
      expect(denied.status).toBe(403);

      const byLabelAdmin = await post('/api/workspace/addWorkspaceMember', labelAdmin.token, {
        workspaceId: ws,
        members: [{ userId: target, roles: [WorkspaceRole.LABELER] }],
      });
      expect(byLabelAdmin.body.data).toEqual({ successCount: 1, failures: [] });

      const byAdmin = await post('/api/workspace/addWorkspaceMember', admin, {
        workspaceId: ws,
        members: [{ userId: target, roles: [WorkspaceRole.REVIEWER] }],
      });
      expect(byAdmin.body.data.successCount).toBe(1);
    });

    it('局部成功：不存在 / 禁用用户进 failures（reason 为错误码）；已存在的 (user, role) 幂等跳过不计数', async () => {
      const ws = await createWorkspace(h.ctx, { spaceCode: uniq('part'), name: '局部成功' });
      const ok = await createUser(h.ctx, { username: uniq('ok'), password: DEFAULT_PASSWORD });
      const disabledName = uniq('dis');
      const disabled = await createUser(h.ctx, {
        username: disabledName,
        password: DEFAULT_PASSWORD,
        status: UserStatus.DISABLED,
      });

      const res = await post('/api/workspace/addWorkspaceMember', admin, {
        workspaceId: ws,
        members: [
          {
            userId: ok,
            roles: [WorkspaceRole.LABELER, WorkspaceRole.REVIEWER, WorkspaceRole.LABELER],
          },
          { userId: 999999999, roles: [WorkspaceRole.LABELER] },
          { userId: disabled, roles: [WorkspaceRole.LABELER] },
        ],
      });
      expect(res.body.data).toEqual({
        successCount: 2,
        failures: [
          { userId: 999999999, username: null, reason: 'USER_INVALID' },
          { userId: disabled, username: disabledName, reason: 'USER_DISABLED' },
        ],
      });

      const again = await post('/api/workspace/addWorkspaceMember', admin, {
        workspaceId: ws,
        members: [{ userId: ok, roles: [WorkspaceRole.LABELER, WorkspaceRole.LABEL_ADMIN] }],
      });
      expect(again.body.data).toEqual({ successCount: 1, failures: [] });
      const ships = await h.ctx.db
        .selectFrom('user_workspace_ship')
        .select('roleInSpace')
        .where('workspaceId', '=', ws)
        .where('userId', '=', ok)
        .orderBy('roleInSpace')
        .execute();
      expect(ships.map((s) => s.roleInSpace)).toEqual([1, 2, 3]);
    });

    it('members 缺省 → successCount 0', async () => {
      const ws = await createWorkspace(h.ctx, { spaceCode: uniq('emp'), name: '空成员' });
      const res = await post('/api/workspace/addWorkspaceMember', admin, { workspaceId: ws });
      expect(res.body.data).toEqual({ successCount: 0, failures: [] });
    });
  });

  describe('POST /getWorkspaceDetail', () => {
    it('权限同成员管理：LABELER → 403；不存在 → WORKSPACE_NOT_FOUND（管理员）', async () => {
      const ws = await createWorkspace(h.ctx, { spaceCode: uniq('det'), name: '详情空间' });
      await addMember(h.ctx, ws, labeler.userId, WorkspaceRole.LABELER);
      expect(
        (await post('/api/workspace/getWorkspaceDetail', labeler.token, { workspaceId: ws }))
          .status,
      ).toBe(403);
      expect(
        (await post('/api/workspace/getWorkspaceDetail', admin, { workspaceId: 999999999 })).body
          .code,
      ).toBe('WORKSPACE_NOT_FOUND');
    });

    it('成员按最早加入排序、同人多角色合并且 roles 按 code 升序；含 status；LABEL_ADMIN 可查看', async () => {
      const ws = await createWorkspace(h.ctx, { spaceCode: uniq('mem'), name: '成员空间' });
      const early = await createUser(h.ctx, {
        username: uniq('ea'),
        password: DEFAULT_PASSWORD,
        displayName: '早加入',
      });
      const late = await createUserAndLogin(h.ctx, h.app, 'la', { displayName: '晚加入' });
      const disabled = await createUser(h.ctx, {
        username: uniq('dz'),
        password: DEFAULT_PASSWORD,
        status: UserStatus.DISABLED,
      });
      const t0 = Date.now() - 10_000;
      await addMember(h.ctx, ws, early, WorkspaceRole.REVIEWER, t0);
      await addMember(h.ctx, ws, late.userId, WorkspaceRole.LABEL_ADMIN, t0 + 1000);
      await addMember(h.ctx, ws, early, WorkspaceRole.LABELER, t0 + 2000);
      await addMember(h.ctx, ws, disabled, WorkspaceRole.LABELER, t0 + 3000);

      const res = await post('/api/workspace/getWorkspaceDetail', late.token, { workspaceId: ws });
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({ workspaceId: ws, name: '成员空间', description: null });
      expect(res.body.data.members).toEqual([
        {
          userId: early,
          username: expect.any(String),
          displayName: '早加入',
          status: 0,
          roles: [1, 2],
        },
        {
          userId: late.userId,
          username: late.username,
          displayName: '晚加入',
          status: 0,
          roles: [3],
        },
        {
          userId: disabled,
          username: expect.any(String),
          displayName: expect.any(String),
          status: 1,
          roles: [1],
        },
      ]);
    });
  });
});
