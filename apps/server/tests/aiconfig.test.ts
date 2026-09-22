import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYS_CONFIG_KEYS } from '../src/infra/sys-config.js';
import { AiConfigService } from '../src/modules/aiconfig/aiconfig.service.js';
import { PermissionService } from '../src/modules/common/permission.js';
import { LabelToolRepository } from '../src/modules/labeltool/labeltool.repo.js';
import { WorkspaceRole } from '../src/modules/workspace/enums.js';
import {
  addMember,
  adminToken,
  bearer,
  createLabelToolRow,
  createTestHarness,
  createUserAndLogin,
  createWorkspace,
  uniq,
  type LoggedInUser,
  type TestHarness,
} from './helpers/app.js';

describe('/api/aiconfig', () => {
  let h: TestHarness;
  let admin: string;
  let labeler: LoggedInUser;
  let labelAdmin: LoggedInUser;
  let toolCode: string;

  beforeAll(async () => {
    h = await createTestHarness();
    admin = await adminToken(h.app);
    labeler = await createUserAndLogin(h.ctx, h.app, 'alab');
    labelAdmin = await createUserAndLogin(h.ctx, h.app, 'aadm');
    const ws = await createWorkspace(h.ctx, { spaceCode: uniq('aws'), name: 'AI 空间' });
    await addMember(h.ctx, ws, labelAdmin.userId, WorkspaceRole.LABEL_ADMIN);
    await addMember(h.ctx, ws, labeler.userId, WorkspaceRole.LABELER);
    toolCode = uniq('aitool');
    await createLabelToolRow(h.ctx, { labelToolCode: toolCode });
  });
  afterAll(() => h.close());

  const post = (path: string, token: string, body: object) =>
    request(h.app).post(path).set('Authorization', bearer(token)).send(body);

  const validBody = (overrides: Record<string, unknown> = {}) => ({
    aiCode: uniq('ai'),
    name: 'GPT 预标注',
    labelToolCode: toolCode,
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-plain-secret',
    model: 'gpt-4o-mini',
    prompt: '你是标注助手',
    ...overrides,
  });

  async function storedRecord(aiCode: string): Promise<Record<string, unknown> | undefined> {
    const content = await h.ctx.sysConfig.getOrNull(SYS_CONFIG_KEYS.aiConfigList);
    const list = JSON.parse(content ?? '[]') as Record<string, unknown>[];
    return list.find((c) => c.aiCode === aiCode);
  }

  describe('POST /createAiConfig', () => {
    it('非系统管理员 → 403（LABEL_ADMIN 也不能写）', async () => {
      expect(
        (await post('/api/aiconfig/createAiConfig', labelAdmin.token, validBody())).status,
      ).toBe(403);
    });

    it('aiCode 正则 / name 长度 / 必填字段文案 / 标注工具不存在', async () => {
      expect(
        (await post('/api/aiconfig/createAiConfig', admin, validBody({ aiCode: 'AI' }))).body.code,
      ).toBe('AI_CODE_INVALID');
      expect(
        (await post('/api/aiconfig/createAiConfig', admin, validBody({ name: '短' }))).body.code,
      ).toBe('AI_NAME_INVALID');
      for (const field of ['labelToolCode', 'baseUrl', 'apiKey', 'model', 'prompt']) {
        const res = await post('/api/aiconfig/createAiConfig', admin, validBody({ [field]: ' ' }));
        expect(res.body).toMatchObject({
          code: 'AI_CONFIG_FIELD_REQUIRED',
          message: `${field} 不能为空`,
        });
      }
      const noTool = await post(
        '/api/aiconfig/createAiConfig',
        admin,
        validBody({ labelToolCode: 'no-such-tool' }),
      );
      expect(noTool.body.code).toBe('LABEL_TOOL_NOT_FOUND');
    });

    it('创建成功 → data null；apiKey 加密落库；重复 aiCode → AI_CODE_EXISTS', async () => {
      const body = validBody();
      const res = await post('/api/aiconfig/createAiConfig', admin, body);
      expect(res.body).toMatchObject({ success: true, data: null });

      const stored = await storedRecord(body.aiCode);
      expect(stored).toMatchObject({
        aiCode: body.aiCode,
        name: body.name,
        labelToolCode: toolCode,
        model: body.model,
      });
      expect(String(stored?.apiKey).startsWith('enc:v1:')).toBe(true);
      expect(String(stored?.apiKey)).not.toContain('sk-plain-secret');

      const dup = await post(
        '/api/aiconfig/createAiConfig',
        admin,
        validBody({ aiCode: body.aiCode }),
      );
      expect(dup.body.code).toBe('AI_CODE_EXISTS');
    });
  });

  describe('POST /updateAiConfig', () => {
    it('不存在 → AI_CONFIG_NOT_FOUND；aiCode 非法 → AI_CODE_INVALID；非管理员 → 403', async () => {
      expect(
        (
          await post('/api/aiconfig/updateAiConfig', admin, {
            aiCode: uniq('none'),
            name: '新的名字',
          })
        ).body.code,
      ).toBe('AI_CONFIG_NOT_FOUND');
      expect((await post('/api/aiconfig/updateAiConfig', admin, { aiCode: 'x' })).body.code).toBe(
        'AI_CODE_INVALID',
      );
      expect(
        (await post('/api/aiconfig/updateAiConfig', labelAdmin.token, { aiCode: uniq('none') }))
          .status,
      ).toBe(403);
    });

    it('局部更新：非空白字段覆盖、apiKey 缺省保留、labelToolCode 不可改；name 传入时校验长度', async () => {
      const body = validBody();
      await post('/api/aiconfig/createAiConfig', admin, body);
      const before = await storedRecord(body.aiCode);

      const res = await post('/api/aiconfig/updateAiConfig', admin, {
        aiCode: body.aiCode,
        name: '改名之后',
        baseUrl: ' ',
        model: 'gpt-4.1',
        labelToolCode: 'another-tool',
      });
      expect(res.body.success).toBe(true);
      const after = await storedRecord(body.aiCode);
      expect(after).toMatchObject({
        name: '改名之后',
        baseUrl: body.baseUrl,
        model: 'gpt-4.1',
        prompt: body.prompt,
        labelToolCode: toolCode,
      });
      expect(after?.apiKey).toBe(before?.apiKey);

      expect(
        (await post('/api/aiconfig/updateAiConfig', admin, { aiCode: body.aiCode, name: 'ab' }))
          .body.code,
      ).toBe('AI_NAME_INVALID');

      const rekey = await post('/api/aiconfig/updateAiConfig', admin, {
        aiCode: body.aiCode,
        apiKey: 'sk-rotated',
      });
      expect(rekey.body.success).toBe(true);
      const rotated = await storedRecord(body.aiCode);
      expect(rotated?.apiKey).not.toBe(before?.apiKey);
      expect(h.ctx.secretBox.decrypt(String(rotated?.apiKey))).toBe('sk-rotated');
    });
  });

  describe('POST /getAiConfigList', () => {
    it('LABELER → 403；LABEL_ADMIN 看到脱敏字段（baseUrl/model/prompt 为 null）；管理员全字段；apiKey 永不出参', async () => {
      const body = validBody();
      await post('/api/aiconfig/createAiConfig', admin, body);

      expect((await post('/api/aiconfig/getAiConfigList', labeler.token, {})).status).toBe(403);

      const masked = await post('/api/aiconfig/getAiConfigList', labelAdmin.token, {});
      const maskedItem = masked.body.data.list.find(
        (c: { aiCode: string }) => c.aiCode === body.aiCode,
      );
      expect(maskedItem).toEqual({
        aiCode: body.aiCode,
        name: body.name,
        labelToolCode: toolCode,
        baseUrl: null,
        model: null,
        prompt: null,
      });

      const full = await post('/api/aiconfig/getAiConfigList', admin, {});
      const fullItem = full.body.data.list.find(
        (c: { aiCode: string }) => c.aiCode === body.aiCode,
      );
      expect(fullItem).toEqual({
        aiCode: body.aiCode,
        name: body.name,
        labelToolCode: toolCode,
        baseUrl: body.baseUrl,
        model: body.model,
        prompt: body.prompt,
      });
      expect(JSON.stringify(full.body)).not.toContain('apiKey');
    });

    it('labelToolCode 过滤（大小写不敏感）；无匹配 → 空列表', async () => {
      const otherTool = uniq('ot');
      await createLabelToolRow(h.ctx, { labelToolCode: otherTool });
      const body = validBody({ labelToolCode: otherTool });
      await post('/api/aiconfig/createAiConfig', admin, body);

      const res = await post('/api/aiconfig/getAiConfigList', admin, {
        labelToolCode: otherTool.toUpperCase(),
      });
      expect(res.body.data.list.map((c: { aiCode: string }) => c.aiCode)).toEqual([body.aiCode]);
      expect(
        (await post('/api/aiconfig/getAiConfigList', admin, { labelToolCode: 'nothing-here' })).body
          .data.list,
      ).toEqual([]);
    });
  });

  describe('AiConfigService.getAiConfigByCode（内部）', () => {
    it('返回解密后的 apiKey；不存在返回 null', async () => {
      const body = validBody({ apiKey: 'sk-internal-secret' });
      await post('/api/aiconfig/createAiConfig', admin, body);
      const service = new AiConfigService({
        sysConfig: h.ctx.sysConfig,
        secretBox: h.ctx.secretBox,
        permissions: new PermissionService(h.ctx.db),
        labelTools: new LabelToolRepository(h.ctx.db),
        lock: h.ctx.lock,
      });
      const found = await service.getAiConfigByCode(body.aiCode);
      expect(found).toMatchObject({
        aiCode: body.aiCode,
        apiKey: 'sk-internal-secret',
        labelToolCode: toolCode,
      });
      expect(await service.getAiConfigByCode('no-such-code')).toBeNull();
    });
  });
});
