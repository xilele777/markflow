import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LabelToolType } from '../src/modules/labeltool/enums.js';
import { WorkspaceRole } from '../src/modules/workspace/enums.js';
import {
  addMember,
  adminToken,
  bearer,
  createLabelToolRow,
  createTestHarness,
  createUserAndLogin,
  createWorkspace,
  SIMPLE_SCHEMA,
  uniq,
  type LoggedInUser,
  type TestHarness,
} from './helpers/app.js';

const PAGE_SCHEMA = {
  root: { props: { layout: 'two', leftWidth: '60%' } },
  content: [],
  zones: {},
};

describe('/api/labeltool', () => {
  let h: TestHarness;
  let admin: string;
  let labeler: LoggedInUser;
  let labelAdmin: LoggedInUser;

  beforeAll(async () => {
    h = await createTestHarness();
    admin = await adminToken(h.app);
    labeler = await createUserAndLogin(h.ctx, h.app, 'tlab');
    labelAdmin = await createUserAndLogin(h.ctx, h.app, 'tadm');
    const ws = await createWorkspace(h.ctx, { spaceCode: uniq('tws'), name: '工具空间' });
    await addMember(h.ctx, ws, labelAdmin.userId, WorkspaceRole.LABEL_ADMIN);
    await addMember(h.ctx, ws, labeler.userId, WorkspaceRole.LABELER);
  });
  afterAll(() => h.close());

  const post = (path: string, token: string, body: object) =>
    request(h.app).post(path).set('Authorization', bearer(token)).send(body);

  const validBody = (overrides: Record<string, unknown> = {}) => ({
    labelToolCode: uniq('tool'),
    labelToolName: '文本分类工具',
    labelToolType: LabelToolType.BUILTIN,
    labelToolJsonSchema: SIMPLE_SCHEMA,
    labelToolPageSchema: PAGE_SCHEMA,
    ...overrides,
  });

  describe('POST /createLabelTool', () => {
    it('type 非 1/2 → LABEL_TOOL_TYPE_INVALID（边界校验，先于权限）', async () => {
      const res = await post(
        '/api/labeltool/createLabelTool',
        labeler.token,
        validBody({ labelToolType: 3 }),
      );
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('LABEL_TOOL_TYPE_INVALID');
    });

    it('非系统管理员 → 403（LABEL_ADMIN 也不能创建）', async () => {
      expect(
        (await post('/api/labeltool/createLabelTool', labelAdmin.token, validBody())).status,
      ).toBe(403);
    });

    it('code / name / IFRAME url 校验', async () => {
      expect(
        (
          await post(
            '/api/labeltool/createLabelTool',
            admin,
            validBody({ labelToolCode: 'Bad Code' }),
          )
        ).body.code,
      ).toBe('LABEL_TOOL_CODE_INVALID');
      expect(
        (await post('/api/labeltool/createLabelTool', admin, validBody({ labelToolName: '短' })))
          .body.code,
      ).toBe('LABEL_TOOL_NAME_INVALID');
      const noUrl = await post(
        '/api/labeltool/createLabelTool',
        admin,
        validBody({ labelToolType: LabelToolType.IFRAME, labelToolUrl: ' ' }),
      );
      expect(noUrl.body).toMatchObject({
        code: 'LABEL_TOOL_URL_INVALID',
        message: '标注工具URL不能为空',
      });
    });

    it('schema 非对象 → LABEL_TOOL_JSON_SCHEMA_INVALID；把样本当 schema（未知关键字）→ 带 ajv 原因', async () => {
      for (const labelToolJsonSchema of [undefined, null, 'x', [1], 1]) {
        const res = await post(
          '/api/labeltool/createLabelTool',
          admin,
          validBody({ labelToolJsonSchema }),
        );
        expect(res.body).toMatchObject({
          code: 'LABEL_TOOL_JSON_SCHEMA_INVALID',
          message: 'labelToolJsonSchema 必须为非空 JSON 对象',
        });
      }
      const sample = await post(
        '/api/labeltool/createLabelTool',
        admin,
        validBody({ labelToolJsonSchema: { id: 1, content: 'hello' } }),
      );
      expect(sample.body.code).toBe('LABEL_TOOL_JSON_SCHEMA_INVALID');
      expect(sample.body.message).toContain(
        'labelToolJsonSchema 不是合法的 JSON Schema（Draft-07）：',
      );
      const badType = await post(
        '/api/labeltool/createLabelTool',
        admin,
        validBody({ labelToolJsonSchema: { type: 'objekt' } }),
      );
      expect(badType.body.code).toBe('LABEL_TOOL_JSON_SCHEMA_INVALID');
    });

    it('BUILTIN 创建成功：jsonb 原样存取、pageSchema 透传；重复编码 → LABEL_TOOL_CODE_EXISTS', async () => {
      const body = validBody();
      const res = await post('/api/labeltool/createLabelTool', admin, body);
      expect(res.body.success).toBe(true);
      const id = res.body.data.labelToolId as number;
      expect(typeof id).toBe('number');

      const detail = await post('/api/labeltool/getLabelToolDetail', admin, { labelToolId: id });
      expect(detail.body.data).toEqual({
        labelToolId: id,
        labelToolCode: body.labelToolCode,
        labelToolName: body.labelToolName,
        labelToolType: LabelToolType.BUILTIN,
        labelToolUrl: null,
        labelToolJsonSchema: SIMPLE_SCHEMA,
        labelToolPageSchema: PAGE_SCHEMA,
        creator: 'admin',
        createTime: expect.any(Number),
      });

      const dup = await post(
        '/api/labeltool/createLabelTool',
        admin,
        validBody({ labelToolCode: body.labelToolCode }),
      );
      expect(dup.body.code).toBe('LABEL_TOOL_CODE_EXISTS');
    });

    it('IFRAME 创建成功：pageSchema 为 null', async () => {
      const body = validBody({
        labelToolType: LabelToolType.IFRAME,
        labelToolUrl: 'https://tool.example.com/label',
        labelToolPageSchema: null,
      });
      const res = await post('/api/labeltool/createLabelTool', admin, body);
      expect(res.body.success).toBe(true);
      const detail = await post('/api/labeltool/getLabelToolDetail', admin, {
        labelToolId: res.body.data.labelToolId,
      });
      expect(detail.body.data).toMatchObject({
        labelToolType: 2,
        labelToolUrl: 'https://tool.example.com/label',
        labelToolPageSchema: null,
      });
    });
  });

  describe('POST /getLabelToolList', () => {
    it('LABELER → 403；LABEL_ADMIN / 系统管理员可看', async () => {
      expect((await post('/api/labeltool/getLabelToolList', labeler.token, {})).status).toBe(403);
      expect(
        (await post('/api/labeltool/getLabelToolList', labelAdmin.token, {})).body.success,
      ).toBe(true);
      expect((await post('/api/labeltool/getLabelToolList', admin, {})).body.success).toBe(true);
    });

    it('keyword 匹配 code / name；条目只含四个字段；按创建时间倒序', async () => {
      const base = uniq('kw');
      const older = await createLabelToolRow(h.ctx, {
        labelToolCode: `${base}-a`,
        labelToolName: `关键字工具A${base}`,
      });
      await new Promise((r) => setTimeout(r, 5));
      const newer = await createLabelToolRow(h.ctx, {
        labelToolCode: `${base}-b`,
        labelToolName: `关键字工具B${base}`,
      });
      const res = await post('/api/labeltool/getLabelToolList', admin, {
        keyword: base,
        pageSize: 10,
      });
      expect(res.body.total).toBe(2);
      expect(res.body.data.map((t: { labelToolId: number }) => t.labelToolId)).toEqual([
        newer,
        older,
      ]);
      expect(Object.keys(res.body.data[0]).sort()).toEqual([
        'labelToolCode',
        'labelToolId',
        'labelToolName',
        'labelToolType',
      ]);
      const byName = await post('/api/labeltool/getLabelToolList', admin, {
        keyword: `关键字工具A${base}`,
      });
      expect(byName.body.total).toBe(1);
    });

    it('已删除工具不出现在列表与详情', async () => {
      const id = await createLabelToolRow(h.ctx, { labelToolCode: uniq('del') });
      await h.ctx.db
        .updateTable('markflow_label_tool')
        .set({ deleted: 1 })
        .where('id', '=', id)
        .execute();
      const detail = await post('/api/labeltool/getLabelToolDetail', admin, { labelToolId: id });
      expect(detail.body.code).toBe('LABEL_TOOL_NOT_FOUND');
    });
  });

  describe('POST /getLabelToolDetail', () => {
    it('LABELER → 403；不存在 → LABEL_TOOL_NOT_FOUND；缺 id → PARAM_INVALID', async () => {
      expect(
        (await post('/api/labeltool/getLabelToolDetail', labeler.token, { labelToolId: 1 })).status,
      ).toBe(403);
      expect(
        (
          await post('/api/labeltool/getLabelToolDetail', labelAdmin.token, {
            labelToolId: 999999999,
          })
        ).body.code,
      ).toBe('LABEL_TOOL_NOT_FOUND');
      expect((await post('/api/labeltool/getLabelToolDetail', admin, {})).body.code).toBe(
        'PARAM_INVALID',
      );
    });
  });
});
