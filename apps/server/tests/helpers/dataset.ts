// 测试辅助：数据集域造数（直接落库 / 直传对象存储）与轮询等待。
import { randomUUID } from 'node:crypto';
import type { AppContext } from '../../src/app/context.js';
import type { DatasetVersionRow } from '../../src/db/schema.js';
import { DatasetType, UploadStatus } from '../../src/modules/dataset/enums.js';

/** 每个元素一行 JSON（对象以外的元素按原样字符串写入，用于制造坏行）。 */
export function jsonlOf(rows: unknown[], eol = '\n'): string {
  return rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join(eol) + eol;
}

/** 直传一个测试文件到桶内 dataset/test/ 前缀，返回对象 key。 */
export async function uploadTestObject(
  ctx: AppContext,
  content: string | Buffer,
  suffix = '.jsonl',
): Promise<string> {
  const key = `dataset/test/${randomUUID().replace(/-/g, '')}${suffix}`;
  await ctx.storage.putObject(key, content);
  return key;
}

export interface InsertDatasetInput {
  spaceCode: string;
  datasetName: string;
  labelToolCode: string | null;
  datasetDesc?: string | null;
  datasetType?: number;
  latestVersionNumber?: number;
  deleted?: number;
  creator?: string;
  createTime?: number;
}

export async function insertDataset(ctx: AppContext, input: InsertDatasetInput): Promise<number> {
  const now = input.createTime ?? Date.now();
  const row = await ctx.db
    .insertInto('markflow_dataset')
    .values({
      spaceCode: input.spaceCode,
      datasetName: input.datasetName,
      datasetDesc: input.datasetDesc ?? null,
      datasetType: input.datasetType ?? DatasetType.ANNOTATION,
      serviceObjName: input.labelToolCode,
      latestVersionNumber: input.latestVersionNumber ?? 1,
      deleted: input.deleted ?? 0,
      ext: null,
      creator: input.creator ?? 'test',
      operator: input.creator ?? 'test',
      createTime: now,
      updateTime: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

export interface InsertVersionInput {
  datasetId: number;
  versionNumber?: number;
  ossPath: string | null;
  uploadStatus?: number;
  sampleCount?: number;
  deleted?: number;
  creator?: string;
}

export async function insertVersion(ctx: AppContext, input: InsertVersionInput): Promise<number> {
  const now = Date.now();
  let versionNumber = input.versionNumber;
  if (versionNumber === undefined) {
    // 缺省取该数据集当前最大版本号 + 1（uk_dataset_version 唯一）。
    const row = await ctx.db
      .selectFrom('markflow_dataset_version')
      .select(({ fn }) => fn.max('versionNumber').as('maxVersion'))
      .where('datasetId', '=', input.datasetId)
      .executeTakeFirst();
    versionNumber = (row?.maxVersion ?? 0) + 1;
  }
  const row = await ctx.db
    .insertInto('markflow_dataset_version')
    .values({
      datasetId: input.datasetId,
      versionNumber,
      versionDesc: null,
      ossPath: input.ossPath,
      uploadStatus: input.uploadStatus ?? UploadStatus.PARSING,
      sampleCount: input.sampleCount ?? 0,
      deleted: input.deleted ?? 0,
      ext: null,
      creator: input.creator ?? 'test',
      operator: input.creator ?? 'test',
      createTime: now,
      updateTime: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

export function selectVersion(ctx: AppContext, versionId: number): Promise<DatasetVersionRow> {
  return ctx.db
    .selectFrom('markflow_dataset_version')
    .selectAll()
    .where('id', '=', versionId)
    .executeTakeFirstOrThrow();
}

/** 轮询直到版本离开 PARSING（消费者异步处理）；超时抛错。 */
export async function waitForParsed(
  ctx: AppContext,
  versionId: number,
  timeoutMs = 15_000,
): Promise<DatasetVersionRow> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await selectVersion(ctx, versionId);
    if (row.uploadStatus !== UploadStatus.PARSING) return row;
    if (Date.now() > deadline)
      throw new Error(`version ${versionId} still PARSING after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 200));
  }
}
