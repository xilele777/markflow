import { Readable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileJsonSchema } from '../src/infra/json-schema.js';
import { UploadStatus, type DatasetVersionExt } from '../src/modules/dataset/enums.js';
import {
  describeParseFailure,
  iterateLines,
  MAX_SAMPLE_ERRORS,
  ParseContext,
  parseJsonlStream,
  type DatasetParseService,
} from '../src/modules/dataset/dataset-parse.service.js';
import {
  createDatasetParseService,
  createDatasetParseWorker,
} from '../src/modules/dataset/dataset-parse.worker.js';
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
  type TestHarness,
} from './helpers/app.js';
import {
  insertDataset,
  insertVersion,
  jsonlOf,
  selectVersion,
  uploadTestObject,
  waitForParsed,
} from './helpers/dataset.js';

const SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    text: { type: 'string' },
    bizId: { type: ['string', 'number'] },
    score: { type: 'integer', minimum: 0 },
  },
  required: ['text'],
};

async function collect(gen: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const line of gen) out.push(line);
  return out;
}

describe('数据集解析', () => {
  let h: TestHarness;
  let service: DatasetParseService;
  let spaceCode: string;
  let toolCode: string;
  let datasetId: number;

  beforeAll(async () => {
    h = await createTestHarness();
    service = createDatasetParseService(h.ctx);
    spaceCode = uniq('dsp');
    await createWorkspace(h.ctx, { spaceCode, name: '解析空间' });
    toolCode = uniq('ptool');
    await createLabelToolRow(h.ctx, { labelToolCode: toolCode, jsonSchema: SCHEMA });
    datasetId = await insertDataset(h.ctx, {
      spaceCode,
      datasetName: uniq('pds'),
      labelToolCode: toolCode,
    });
  });
  afterAll(() => h.close());

  const samplesOf = (versionId: number) =>
    h.ctx.db
      .selectFrom('lingshu_dataset_sample')
      .selectAll()
      .where('datasetVersionId', '=', versionId)
      .orderBy('id', 'asc')
      .execute();

  const parseFile = async (content: string | Buffer, suffix = '.jsonl') => {
    const ossPath = await uploadTestObject(h.ctx, content, suffix);
    const versionId = await insertVersion(h.ctx, { datasetId, ossPath, creator: 'uploader' });
    await service.parseDatasetVersion(versionId);
    return { versionId, version: await selectVersion(h.ctx, versionId) };
  };

  describe('iterateLines / parseJsonlStream（流式拆行）', () => {
    it('\\r\\n、\\n、\\r 均可拆行；跨块的 \\r\\n 只多出可忽略的空行；末行无换行也能读到', async () => {
      const chunks = ['{"a":1}\r', '\n{"a":2}\n{"a":3}\r{"a":4}', '\n{"a":5}'];
      const lines = await collect(iterateLines(Readable.from(chunks.map((c) => Buffer.from(c)))));
      expect(lines.filter((l) => l !== '')).toEqual([
        '{"a":1}',
        '{"a":2}',
        '{"a":3}',
        '{"a":4}',
        '{"a":5}',
      ]);
    });

    it('多字节字符跨块不乱码', async () => {
      const text = '{"text":"中文样本"}\n';
      const buf = Buffer.from(text);
      const lines = await collect(
        iterateLines(Readable.from([buf.subarray(0, 12), buf.subarray(12)])),
      );
      expect(lines).toEqual(['{"text":"中文样本"}']);
    });

    it('流中途出错 → 解析拒绝（由上层标记 PARSE_FAILED）', async () => {
      const broken = new Readable({
        read() {
          this.push('{"text":"a"}\n');
          this.destroy(new Error('connection reset'));
        },
      });
      const ctx = new ParseContext(compileJsonSchema(SCHEMA), 0, 'x', Date.now(), async () => {});
      await expect(parseJsonlStream(broken, ctx)).rejects.toThrow('connection reset');
    });

    it('ParseContext：满批即刷、结束 flush 剩余；错误明细上限', async () => {
      const flushed: number[] = [];
      const ctx = new ParseContext(
        compileJsonSchema(SCHEMA),
        0,
        'x',
        Date.now(),
        async (rows) => {
          flushed.push(rows.length);
        },
        3,
        2,
      );
      for (let i = 0; i < 7; i += 1) await ctx.acceptContent({ text: `t${i}` });
      ctx.recordParseError('bad-1');
      ctx.recordParseError('bad-2');
      ctx.recordParseError('bad-3');
      await ctx.flush();
      expect(flushed).toEqual([3, 3, 1]);
      expect(ctx.totalCount).toBe(10);
      expect(ctx.successCount).toBe(7);
      expect(ctx.skippedCount).toBe(3);
      expect(ctx.sampleErrors).toEqual([
        { rowNumber: 8, error: 'bad-1' },
        { rowNumber: 9, error: 'bad-2' },
      ]);
    });
  });

  describe('parseDatasetVersion', () => {
    it('正常文件（含 BOM、CRLF、空行）→ READY；bizId 取自 content.bizId；样本 JSON 原样落库', async () => {
      const content =
        '\uFEFF' +
        jsonlOf(
          [
            { text: '第一条', bizId: 'b-1' },
            '',
            { text: '第二条', bizId: 7, score: 3 },
            '   ',
            { text: '第三条' },
          ],
          '\r\n',
        );
      const { versionId, version } = await parseFile(content);
      expect(version.uploadStatus).toBe(UploadStatus.READY);
      expect(version.sampleCount).toBe(3);
      expect(version.operator).toBe('uploader');
      expect(version.ext).toEqual({
        totalRowCount: 3,
        successRowCount: 3,
        skippedRowCount: 0,
        sampleErrors: [],
        parseFailureReason: null,
      });
      const samples = await samplesOf(versionId);
      expect(samples.map((s) => s.bizId)).toEqual(['b-1', '7', null]);
      expect(samples.map((s) => s.sampleDataJson)).toEqual([
        { text: '第一条', bizId: 'b-1' },
        { text: '第二条', bizId: 7, score: 3 },
        { text: '第三条' },
      ]);
      expect(samples[0]).toMatchObject({ deleted: 0, creator: 'uploader', operator: 'uploader' });
      expect(new Set(samples.map((s) => s.createTime)).size).toBe(1);
    });

    it('坏行：非法 JSON / 数组 / schema 不通过 / bizId 超长 → 跳过并记 rowNumber 与原因', async () => {
      const content = jsonlOf([
        { text: 'ok-1' },
        'not json',
        [1, 2],
        { bizId: 'no-text' },
        { text: 5 },
        { text: 'ok-2', score: -1 },
        { text: 'ok-3', bizId: 'x'.repeat(65) },
        { text: 'ok-4' },
      ]);
      const { versionId, version } = await parseFile(content);
      expect(version.uploadStatus).toBe(UploadStatus.READY);
      expect(version.sampleCount).toBe(2);
      const ext = version.ext as DatasetVersionExt;
      expect(ext.totalRowCount).toBe(8);
      expect(ext.successRowCount).toBe(2);
      expect(ext.skippedRowCount).toBe(6);
      expect(ext.sampleErrors).toEqual([
        { rowNumber: 2, error: '非法 JSON 行或非对象' },
        { rowNumber: 3, error: '非法 JSON 行或非对象' },
        { rowNumber: 4, error: "schema 校验失败: $ must have required property 'text'" },
        { rowNumber: 5, error: 'schema 校验失败: $/text must be string' },
        { rowNumber: 6, error: 'schema 校验失败: $/score must be >= 0' },
        { rowNumber: 7, error: 'bizId 超过 64 字符' },
      ]);
      expect(
        (await samplesOf(versionId)).map((s) => (s.sampleDataJson as { text: string }).text),
      ).toEqual(['ok-1', 'ok-4']);
    });

    it('错误超过 100 条只计数不记录；多批（>1000 行）全部入库', async () => {
      const rows: unknown[] = [];
      for (let i = 0; i < 2500; i += 1) rows.push({ text: `row-${i}`, bizId: i });
      for (let i = 0; i < 150; i += 1) rows.push('{broken');
      const { versionId, version } = await parseFile(jsonlOf(rows));
      expect(version.uploadStatus).toBe(UploadStatus.READY);
      expect(version.sampleCount).toBe(2500);
      const ext = version.ext as DatasetVersionExt;
      expect(ext).toMatchObject({
        totalRowCount: 2650,
        successRowCount: 2500,
        skippedRowCount: 150,
      });
      expect(ext.sampleErrors).toHaveLength(MAX_SAMPLE_ERRORS);
      expect(ext.sampleErrors?.[0]).toEqual({ rowNumber: 2501, error: '非法 JSON 行或非对象' });
      expect(await samplesOf(versionId).then((s) => s.length)).toBe(2500);
    });

    it('重解析幂等：先清场再入库，样本数不翻倍', async () => {
      const { versionId } = await parseFile(jsonlOf([{ text: 'a' }, { text: 'b' }]));
      await service.parseDatasetVersion(versionId);
      const version = await selectVersion(h.ctx, versionId);
      expect(version.sampleCount).toBe(2);
      expect(await samplesOf(versionId).then((s) => s.length)).toBe(2);
    });

    it('不支持的后缀 → PARSE_FAILED，原因为业务文案，其余统计为 null，sampleCount 不变', async () => {
      const { versionId, version } = await parseFile('a,b\n1,2\n', '.csv');
      expect(version.uploadStatus).toBe(UploadStatus.PARSE_FAILED);
      expect(version.sampleCount).toBe(0);
      expect(version.ext).toEqual({
        totalRowCount: null,
        successRowCount: null,
        skippedRowCount: null,
        sampleErrors: null,
        parseFailureReason: '不支持的文件类型',
      });
      expect(await samplesOf(versionId).then((s) => s.length)).toBe(0);
    });

    it('对象不存在 → PARSE_FAILED，原因带 S3 错误名', async () => {
      const versionId = await insertVersion(h.ctx, {
        datasetId,
        ossPath: 'dataset/test/does-not-exist.jsonl',
      });
      await service.parseDatasetVersion(versionId);
      const version = await selectVersion(h.ctx, versionId);
      expect(version.uploadStatus).toBe(UploadStatus.PARSE_FAILED);
      const ext = version.ext as DatasetVersionExt;
      expect(ext.parseFailureReason).toContain('对象下载失败');
      expect(ext.parseFailureReason).toContain('NoSuchKey');
    });

    it('标注工具缺 schema / 不存在 → LABEL_TOOL_SCHEMA_MISSING 文案', async () => {
      const noSchemaTool = uniq('nst');
      const toolId = await createLabelToolRow(h.ctx, { labelToolCode: noSchemaTool });
      await h.ctx.db
        .updateTable('lingshu_label_tool')
        .set({ labelToolJsonSchema: null })
        .where('id', '=', toolId)
        .execute();
      const ossPath = await uploadTestObject(h.ctx, jsonlOf([{ text: 'a' }]));
      for (const labelToolCode of [noSchemaTool, 'ghost-tool']) {
        const ds = await insertDataset(h.ctx, {
          spaceCode,
          datasetName: uniq('nsd'),
          labelToolCode,
        });
        const versionId = await insertVersion(h.ctx, { datasetId: ds, ossPath });
        await service.parseDatasetVersion(versionId);
        const version = await selectVersion(h.ctx, versionId);
        expect(version.uploadStatus).toBe(UploadStatus.PARSE_FAILED);
        expect((version.ext as DatasetVersionExt).parseFailureReason).toBe(
          '标注工具未配置 JSON Schema，无法校验源数据',
        );
      }
    });

    it('数据集已删除 → PARSE_FAILED（DATASET_NOT_FOUND）；版本不存在 / 已删除 → 直接跳过不报错', async () => {
      const deletedDs = await insertDataset(h.ctx, {
        spaceCode,
        datasetName: uniq('dd'),
        labelToolCode: toolCode,
        deleted: 1,
      });
      const versionId = await insertVersion(h.ctx, { datasetId: deletedDs, ossPath: 'x.jsonl' });
      await service.parseDatasetVersion(versionId);
      expect((await selectVersion(h.ctx, versionId)).ext).toMatchObject({
        parseFailureReason: '数据集不存在',
      });

      await expect(service.parseDatasetVersion(999999999)).resolves.toBeUndefined();
      const deletedVersion = await insertVersion(h.ctx, {
        datasetId,
        versionNumber: 99,
        ossPath: 'x.jsonl',
        deleted: 1,
      });
      await service.parseDatasetVersion(deletedVersion);
      expect((await selectVersion(h.ctx, deletedVersion)).uploadStatus).toBe(UploadStatus.PARSING);
    });

    it('失败原因超过 500 字符截断', () => {
      const reason = describeParseFailure(new Error('x'.repeat(600)));
      expect(reason.startsWith('Error: ')).toBe(true);
      expect(reason.length).toBe(503);
      expect(reason.endsWith('...')).toBe(true);
    });
  });

  describe('dataset-parse 队列消费者（接口 → 入队 → worker → READY / PARSE_FAILED）', () => {
    let worker: ReturnType<typeof createDatasetParseWorker>;
    let admin: string;
    let labelAdmin: string;
    let wsCode: string;

    beforeAll(async () => {
      await h.ctx.queues.datasetParse.obliterate({ force: true });
      worker = createDatasetParseWorker(h.ctx);
      await worker.waitUntilReady();
      admin = await adminToken(h.app);
      wsCode = uniq('dsw');
      const ws = await createWorkspace(h.ctx, { spaceCode: wsCode, name: '消费者空间' });
      const user = await createUserAndLogin(h.ctx, h.app, 'dwa');
      await addMember(h.ctx, ws, user.userId, WorkspaceRole.LABEL_ADMIN);
      labelAdmin = user.token;
    });
    afterAll(() => worker.close());

    const post = (path: string, token: string, body: object) =>
      request(h.app).post(path).set('Authorization', bearer(token)).send(body);

    it('createDataset → 解析 → 详情 READY + 统计 → 预览前 10 条', async () => {
      const rows = Array.from({ length: 15 }, (_, i) => ({
        text: `样本 ${i + 1}`,
        bizId: `b${i + 1}`,
      }));
      const ossPath = await uploadTestObject(h.ctx, jsonlOf([...rows, 'oops']));
      const created = await post('/api/dataset/createDataset', labelAdmin, {
        spaceCode: wsCode,
        datasetName: `消费者数据集${uniq('c')}`,
        labelToolCode: toolCode,
        ossPath,
      });
      expect(created.body.success).toBe(true);
      const { datasetId: dsId, versionId } = created.body.data;

      const version = await waitForParsed(h.ctx, versionId);
      expect(version.uploadStatus).toBe(UploadStatus.READY);

      const detail = await post('/api/dataset/getDatasetDetail', labelAdmin, { datasetId: dsId });
      expect(detail.body.data.versions[0]).toMatchObject({
        versionId,
        uploadStatus: UploadStatus.READY,
        sampleCount: 15,
        parseExt: {
          totalRowCount: 16,
          successRowCount: 15,
          skippedRowCount: 1,
          sampleErrors: [{ rowNumber: 16, error: '非法 JSON 行或非对象' }],
          parseFailureReason: null,
        },
      });

      const preview = await post('/api/dataset/getVersionSamplePreview', labelAdmin, { versionId });
      expect(preview.body.data.list).toHaveLength(10);
      expect(preview.body.data.list[0]).toMatchObject({ bizId: 'b1', sampleData: rows[0] });

      // 任务成功即删除
      expect(await h.ctx.queues.datasetParse.getJob(`version-${versionId}`)).toBeUndefined();
    });

    it('createDatasetVersion 指向错误文件 → PARSE_FAILED 且原因可从详情看到', async () => {
      const ds = await post('/api/dataset/createDataset', admin, {
        spaceCode: wsCode,
        datasetName: `失败数据集${uniq('f')}`,
        labelToolCode: toolCode,
        ossPath: await uploadTestObject(h.ctx, jsonlOf([{ text: 'ok' }])),
      });
      const dsId = ds.body.data.datasetId as number;
      await waitForParsed(h.ctx, ds.body.data.versionId);

      const v2 = await post('/api/dataset/createDatasetVersion', admin, {
        datasetId: dsId,
        ossPath: await uploadTestObject(h.ctx, 'a,b\n', '.csv'),
      });
      expect(v2.body.data.versionNumber).toBe(2);
      const failed = await waitForParsed(h.ctx, v2.body.data.versionId);
      expect(failed.uploadStatus).toBe(UploadStatus.PARSE_FAILED);

      const detail = await post('/api/dataset/getDatasetDetail', admin, { datasetId: dsId });
      expect(detail.body.data.versions[0]).toMatchObject({
        versionNumber: 2,
        uploadStatus: UploadStatus.PARSE_FAILED,
        parseExt: { parseFailureReason: '不支持的文件类型' },
      });
      expect(detail.body.data.versions[1]).toMatchObject({
        versionNumber: 1,
        uploadStatus: UploadStatus.READY,
        sampleCount: 1,
      });
    });
  });
});
