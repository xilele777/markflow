import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatasetType, UploadStatus } from '../src/modules/dataset/enums.js';
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
import { insertDataset, insertVersion } from './helpers/dataset.js';
import { insertSample } from './helpers/seed.js';

describe('/api/dataset', () => {
  let h: TestHarness;
  let admin: string;
  let spaceA: string;
  let spaceB: string;
  let labelAdminA: LoggedInUser;
  let labelAdminB: LoggedInUser;
  let labelerA: LoggedInUser;
  let toolCode: string;

  beforeAll(async () => {
    h = await createTestHarness();
    admin = await adminToken(h.app);
    spaceA = uniq('dsa');
    spaceB = uniq('dsb');
    const wsA = await createWorkspace(h.ctx, { spaceCode: spaceA, name: '数据集空间A' });
    const wsB = await createWorkspace(h.ctx, { spaceCode: spaceB, name: '数据集空间B' });
    labelAdminA = await createUserAndLogin(h.ctx, h.app, 'dla');
    labelAdminB = await createUserAndLogin(h.ctx, h.app, 'dlb');
    labelerA = await createUserAndLogin(h.ctx, h.app, 'dlr');
    await addMember(h.ctx, wsA, labelAdminA.userId, WorkspaceRole.LABEL_ADMIN);
    await addMember(h.ctx, wsB, labelAdminB.userId, WorkspaceRole.LABEL_ADMIN);
    await addMember(h.ctx, wsA, labelerA.userId, WorkspaceRole.LABELER);
    toolCode = uniq('dtool');
    await createLabelToolRow(h.ctx, { labelToolCode: toolCode });
  });
  afterAll(() => h.close());

  const post = (path: string, token: string, body: object) =>
    request(h.app).post(path).set('Authorization', bearer(token)).send(body);

  const validCreate = (overrides: Record<string, unknown> = {}) => ({
    spaceCode: spaceA,
    datasetName: `数据集${uniq('n')}`,
    datasetDesc: '描述',
    labelToolCode: toolCode,
    ossPath: 'dataset/20260922/abc.jsonl',
    versionDesc: '初始版本',
    ...overrides,
  });

  describe('POST /getUploadPreSignedUrl', () => {
    it('LABELER → 403；缺 fileName → UPLOAD_FILE_NAME_REQUIRED', async () => {
      expect(
        (await post('/api/dataset/getUploadPreSignedUrl', labelerA.token, { fileName: 'a.jsonl' }))
          .status,
      ).toBe(403);
      const res = await post('/api/dataset/getUploadPreSignedUrl', labelAdminA.token, {
        fileName: '  ',
      });
      expect(res.body).toMatchObject({
        code: 'UPLOAD_FILE_NAME_REQUIRED',
        message: 'fileName 不能为空',
      });
    });

    it('返回 dataset/{yyyyMMdd}/{uuid32}.jsonl 与可用的预签名 PUT URL（真实上传到 MinIO）', async () => {
      const res = await post('/api/dataset/getUploadPreSignedUrl', labelAdminA.token, {
        fileName: '样本 v1.JSONL',
      });
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.objectKey).toMatch(/^dataset\/\d{8}\/[0-9a-f]{32}\.JSONL$/);
      expect(data).toMatchObject({ httpMethod: 'PUT', signedHeaders: {}, expiresInSeconds: 3600 });
      expect(data.uploadUrl.startsWith(h.ctx.config.storage.publicEndpoint)).toBe(true);
      expect(data.uploadUrl).toContain(data.objectKey);
      expect(data.uploadUrl).toContain('X-Amz-Signature=');

      const put = await fetch(data.uploadUrl, { method: 'PUT', body: '{"text":"hello"}\n' });
      expect(put.status).toBe(200);
      expect(await h.ctx.storage.objectExists(data.objectKey)).toBe(true);
    });

    it('只保留字母数字后缀：无后缀 / 多段后缀 / 奇怪后缀', async () => {
      const keyOf = async (fileName: string) =>
        (await post('/api/dataset/getUploadPreSignedUrl', admin, { fileName })).body.data
          .objectKey as string;
      expect(await keyOf('noext')).toMatch(/^dataset\/\d{8}\/[0-9a-f]{32}$/);
      expect(await keyOf('a.tar.gz')).toMatch(/\.gz$/);
      expect(await keyOf('x.js?nl')).toMatch(/^dataset\/\d{8}\/[0-9a-f]{32}$/);
      expect(await keyOf('trailing.')).toMatch(/^dataset\/\d{8}\/[0-9a-f]{32}$/);
    });
  });

  describe('POST /createDataset', () => {
    it('空间不存在 / 未传 → WORKSPACE_NOT_FOUND（先于权限）', async () => {
      expect(
        (
          await post(
            '/api/dataset/createDataset',
            labelerA.token,
            validCreate({ spaceCode: 'nope' }),
          )
        ).body.code,
      ).toBe('WORKSPACE_NOT_FOUND');
      expect(
        (await post('/api/dataset/createDataset', admin, validCreate({ spaceCode: null }))).body
          .code,
      ).toBe('WORKSPACE_NOT_FOUND');
    });

    it('LABELER → 403；其它空间的 LABEL_ADMIN → 403', async () => {
      expect((await post('/api/dataset/createDataset', labelerA.token, validCreate())).status).toBe(
        403,
      );
      expect(
        (await post('/api/dataset/createDataset', labelAdminB.token, validCreate())).status,
      ).toBe(403);
    });

    it('参数校验顺序：name 4-32 → desc ≤ 512 → ossPath → labelToolCode → 工具存在', async () => {
      const codeOf = async (overrides: Record<string, unknown>) =>
        (await post('/api/dataset/createDataset', labelAdminA.token, validCreate(overrides))).body
          .code;
      expect(await codeOf({ datasetName: 'abc' })).toBe('DATASET_NAME_INVALID');
      expect(await codeOf({ datasetName: 'x'.repeat(33) })).toBe('DATASET_NAME_INVALID');
      expect(await codeOf({ datasetName: undefined })).toBe('DATASET_NAME_INVALID');
      expect(await codeOf({ datasetDesc: 'd'.repeat(513) })).toBe('DATASET_DESC_TOO_LONG');
      expect(await codeOf({ ossPath: ' ' })).toBe('OSS_PATH_REQUIRED');
      expect(await codeOf({ labelToolCode: '' })).toBe('LABEL_TOOL_CODE_REQUIRED');
      expect(await codeOf({ labelToolCode: 'no-such-tool' })).toBe('LABEL_TOOL_NOT_FOUND');
      expect(await codeOf({ datasetName: 1234 })).toBe('PARAM_INVALID');
    });

    it('创建成功：dataset(ANNOTATION, latest=1) + version(v1 PARSING) 落库，解析任务入队', async () => {
      const body = validCreate();
      const res = await post('/api/dataset/createDataset', labelAdminA.token, body);
      expect(res.body.success).toBe(true);
      const { datasetId, versionId, versionNumber } = res.body.data;
      expect(versionNumber).toBe(1);

      const dataset = await h.ctx.db
        .selectFrom('lingshu_dataset')
        .selectAll()
        .where('id', '=', datasetId)
        .executeTakeFirstOrThrow();
      expect(dataset).toMatchObject({
        spaceCode: spaceA,
        datasetName: body.datasetName,
        datasetDesc: '描述',
        datasetType: DatasetType.ANNOTATION,
        serviceObjName: toolCode,
        latestVersionNumber: 1,
        deleted: 0,
        creator: labelAdminA.username,
      });
      const version = await h.ctx.db
        .selectFrom('lingshu_dataset_version')
        .selectAll()
        .where('id', '=', versionId)
        .executeTakeFirstOrThrow();
      expect(version).toMatchObject({
        datasetId,
        versionNumber: 1,
        versionDesc: '初始版本',
        ossPath: body.ossPath,
        uploadStatus: UploadStatus.PARSING,
        sampleCount: 0,
        ext: null,
        creator: labelAdminA.username,
      });
      const job = await h.ctx.queues.datasetParse.getJob(`version-${versionId}`);
      expect(job?.data).toEqual({ versionId });
    });

    it('同空间同名（大小写不敏感）→ DATASET_NAME_EXISTS；不同空间可同名；系统管理员可建', async () => {
      const name = `Dup${uniq('d')}`;
      expect(
        (
          await post(
            '/api/dataset/createDataset',
            labelAdminA.token,
            validCreate({ datasetName: name }),
          )
        ).body.success,
      ).toBe(true);
      expect(
        (
          await post(
            '/api/dataset/createDataset',
            labelAdminA.token,
            validCreate({ datasetName: name.toUpperCase() }),
          )
        ).body.code,
      ).toBe('DATASET_NAME_EXISTS');
      expect(
        (
          await post(
            '/api/dataset/createDataset',
            admin,
            validCreate({ datasetName: name, spaceCode: spaceB }),
          )
        ).body.success,
      ).toBe(true);
    });

    it('desc / versionDesc 可省略；存为 null', async () => {
      const res = await post(
        '/api/dataset/createDataset',
        admin,
        validCreate({ datasetDesc: undefined, versionDesc: undefined }),
      );
      expect(res.body.success).toBe(true);
      const detail = await post('/api/dataset/getDatasetDetail', admin, {
        datasetId: res.body.data.datasetId,
      });
      expect(detail.body.data.datasetDesc).toBeNull();
      expect(detail.body.data.versions[0].versionDesc).toBeNull();
    });
  });

  describe('POST /createDatasetVersion', () => {
    let datasetId: number;

    beforeAll(async () => {
      const res = await post('/api/dataset/createDataset', labelAdminA.token, validCreate());
      datasetId = res.body.data.datasetId;
    });

    it('datasetId 缺失 / 不存在 / 已删除 → DATASET_NOT_FOUND', async () => {
      expect(
        (await post('/api/dataset/createDatasetVersion', admin, { ossPath: 'a.jsonl' })).body.code,
      ).toBe('DATASET_NOT_FOUND');
      expect(
        (
          await post('/api/dataset/createDatasetVersion', admin, {
            datasetId: 999999999,
            ossPath: 'a.jsonl',
          })
        ).body.code,
      ).toBe('DATASET_NOT_FOUND');
      const deleted = await insertDataset(h.ctx, {
        spaceCode: spaceA,
        datasetName: uniq('del'),
        labelToolCode: toolCode,
        deleted: 1,
      });
      expect(
        (
          await post('/api/dataset/createDatasetVersion', admin, {
            datasetId: deleted,
            ossPath: 'a.jsonl',
          })
        ).body.code,
      ).toBe('DATASET_NOT_FOUND');
    });

    it('权限按 dataset.spaceCode：LABELER / 其它空间 LABEL_ADMIN → 403', async () => {
      for (const token of [labelerA.token, labelAdminB.token]) {
        expect(
          (
            await post('/api/dataset/createDatasetVersion', token, {
              datasetId,
              ossPath: 'a.jsonl',
            })
          ).status,
        ).toBe(403);
      }
    });

    it('ossPath 必填；versionDesc ≤ 512', async () => {
      expect(
        (await post('/api/dataset/createDatasetVersion', labelAdminA.token, { datasetId })).body
          .code,
      ).toBe('OSS_PATH_REQUIRED');
      expect(
        (
          await post('/api/dataset/createDatasetVersion', labelAdminA.token, {
            datasetId,
            ossPath: 'a.jsonl',
            versionDesc: 'v'.repeat(513),
          })
        ).body.code,
      ).toBe('VERSION_DESC_TOO_LONG');
    });

    it('成功：版本号递增、latestVersionNumber 回写、详情按版本号降序', async () => {
      const res = await post('/api/dataset/createDatasetVersion', labelAdminA.token, {
        datasetId,
        ossPath: 'dataset/20260922/v2.jsonl',
        versionDesc: '第二版',
      });
      expect(res.body.success).toBe(true);
      expect(res.body.data.versionNumber).toBe(2);
      const detail = await post('/api/dataset/getDatasetDetail', labelAdminA.token, { datasetId });
      expect(detail.body.data.latestVersionNumber).toBe(2);
      expect(
        detail.body.data.versions.map((v: { versionNumber: number }) => v.versionNumber),
      ).toEqual([2, 1]);
      expect(detail.body.data.versions[0]).toMatchObject({
        versionId: res.body.data.versionId,
        versionDesc: '第二版',
        uploadStatus: UploadStatus.PARSING,
        sampleCount: 0,
        creator: labelAdminA.username,
        parseExt: null,
      });
    });

    it('并发建版本：锁 + 行锁保证版本号连续且各不相同', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          post('/api/dataset/createDatasetVersion', admin, {
            datasetId,
            ossPath: `dataset/20260922/c${i}.jsonl`,
          }),
        ),
      );
      const numbers = results.map((r) => r.body.data?.versionNumber).sort((a, b) => a - b);
      expect(numbers).toEqual([3, 4, 5, 6, 7]);
      const dataset = await h.ctx.db
        .selectFrom('lingshu_dataset')
        .select('latestVersionNumber')
        .where('id', '=', datasetId)
        .executeTakeFirstOrThrow();
      expect(dataset.latestVersionNumber).toBe(7);
    });
  });

  describe('POST /getDatasetList', () => {
    let space: string;
    let older: number;
    let newer: number;

    beforeAll(async () => {
      space = uniq('dsl');
      const ws = await createWorkspace(h.ctx, { spaceCode: space, name: '列表空间' });
      await addMember(h.ctx, ws, labelAdminA.userId, WorkspaceRole.LABEL_ADMIN);
      const base = Date.now() - 10_000;
      older = await insertDataset(h.ctx, {
        spaceCode: space,
        datasetName: '医疗对话集',
        datasetDesc: '门诊问答',
        labelToolCode: toolCode,
        createTime: base,
      });
      newer = await insertDataset(h.ctx, {
        spaceCode: space,
        datasetName: '客服语料',
        datasetDesc: '含医疗类咨询',
        labelToolCode: toolCode,
        createTime: base + 1000,
      });
      await insertDataset(h.ctx, {
        spaceCode: space,
        datasetName: '结果集不可见',
        labelToolCode: toolCode,
        datasetType: DatasetType.RESULT,
      });
      await insertDataset(h.ctx, {
        spaceCode: space,
        datasetName: '已删除不可见',
        labelToolCode: toolCode,
        deleted: 1,
      });
    });

    it('LABELER → 403；空间不存在 → WORKSPACE_NOT_FOUND；pageNum 0 → PARAM_INVALID', async () => {
      expect(
        (await post('/api/dataset/getDatasetList', labelerA.token, { spaceCode: spaceA })).status,
      ).toBe(403);
      expect(
        (await post('/api/dataset/getDatasetList', admin, { spaceCode: 'ghost' })).body.code,
      ).toBe('WORKSPACE_NOT_FOUND');
      expect(
        (await post('/api/dataset/getDatasetList', admin, { spaceCode: space, pageNum: 0 })).body
          .code,
      ).toBe('PARAM_INVALID');
    });

    it('只列源数据集（排除 RESULT 与已删除），按创建时间倒序，条目七个字段', async () => {
      const res = await post('/api/dataset/getDatasetList', labelAdminA.token, {
        spaceCode: space,
      });
      expect(res.body.total).toBe(2);
      expect(res.body.data.map((d: { datasetId: number }) => d.datasetId)).toEqual([newer, older]);
      expect(res.body.data[1]).toEqual({
        datasetId: older,
        datasetName: '医疗对话集',
        datasetDesc: '门诊问答',
        labelToolCode: toolCode,
        latestVersionNumber: 1,
        creator: 'test',
        createTime: expect.any(Number),
      });
      expect(res.body).toMatchObject({ pageNum: 1, pageSize: 20 });
    });

    it('keyword 匹配名称或描述；通配符按字面匹配', async () => {
      const byName = await post('/api/dataset/getDatasetList', admin, {
        spaceCode: space,
        keyword: '客服',
      });
      expect(byName.body.data.map((d: { datasetId: number }) => d.datasetId)).toEqual([newer]);
      const byDesc = await post('/api/dataset/getDatasetList', admin, {
        spaceCode: space,
        keyword: '医疗',
      });
      expect(byDesc.body.total).toBe(2);
      const literal = await post('/api/dataset/getDatasetList', admin, {
        spaceCode: space,
        keyword: '%',
      });
      expect(literal.body.total).toBe(0);
    });
  });

  describe('POST /getDatasetDetail 与 /getVersionSamplePreview', () => {
    let datasetId: number;
    let versionId: number;

    beforeAll(async () => {
      datasetId = await insertDataset(h.ctx, {
        spaceCode: spaceA,
        datasetName: uniq('det'),
        labelToolCode: toolCode,
      });
      versionId = await insertVersion(h.ctx, {
        datasetId,
        ossPath: 'dataset/x.jsonl',
        uploadStatus: UploadStatus.READY,
        sampleCount: 12,
      });
      for (let i = 1; i <= 12; i += 1) {
        await insertSample(h.ctx, {
          datasetVersionId: versionId,
          bizId: i % 2 === 0 ? `biz-${i}` : null,
          sampleData: { text: `样本 ${i}`, nested: { n: i } },
        });
      }
    });

    it('详情：datasetId 缺失 / 不存在 → DATASET_NOT_FOUND；其它空间 LABEL_ADMIN → 403；字段完整', async () => {
      expect((await post('/api/dataset/getDatasetDetail', admin, {})).body.code).toBe(
        'DATASET_NOT_FOUND',
      );
      expect(
        (await post('/api/dataset/getDatasetDetail', labelAdminB.token, { datasetId })).status,
      ).toBe(403);
      const res = await post('/api/dataset/getDatasetDetail', labelAdminA.token, { datasetId });
      expect(res.body.data).toMatchObject({
        datasetId,
        spaceCode: spaceA,
        labelToolCode: toolCode,
        latestVersionNumber: 1,
        creator: 'test',
      });
      expect(Object.keys(res.body.data).sort()).toEqual([
        'createTime',
        'creator',
        'datasetDesc',
        'datasetId',
        'datasetName',
        'labelToolCode',
        'latestVersionNumber',
        'spaceCode',
        'versions',
      ]);
      expect(res.body.data.versions).toHaveLength(1);
      expect(Object.keys(res.body.data.versions[0]).sort()).toEqual([
        'createTime',
        'creator',
        'parseExt',
        'sampleCount',
        'uploadStatus',
        'versionDesc',
        'versionId',
        'versionNumber',
      ]);
    });

    it('预览：版本缺失 / 已删除 → DATASET_VERSION_NOT_FOUND；LABELER → 403；最多 10 条按 id 升序', async () => {
      expect((await post('/api/dataset/getVersionSamplePreview', admin, {})).body.code).toBe(
        'DATASET_VERSION_NOT_FOUND',
      );
      const deletedVersion = await insertVersion(h.ctx, {
        datasetId,
        versionNumber: 2,
        ossPath: 'x.jsonl',
        deleted: 1,
      });
      expect(
        (await post('/api/dataset/getVersionSamplePreview', admin, { versionId: deletedVersion }))
          .body.code,
      ).toBe('DATASET_VERSION_NOT_FOUND');
      expect(
        (await post('/api/dataset/getVersionSamplePreview', labelerA.token, { versionId })).status,
      ).toBe(403);

      const res = await post('/api/dataset/getVersionSamplePreview', labelAdminA.token, {
        versionId,
      });
      const list = res.body.data.list as Array<{
        id: number;
        bizId: string | null;
        sampleData: unknown;
      }>;
      expect(list).toHaveLength(10);
      const ids = list.map((s) => s.id);
      expect([...ids].sort((a, b) => a - b)).toEqual(ids);
      expect(list[0]).toEqual({
        id: ids[0],
        bizId: null,
        sampleData: { text: '样本 1', nested: { n: 1 } },
      });
      expect(list[1]!.bizId).toBe('biz-2');
    });
  });
});
