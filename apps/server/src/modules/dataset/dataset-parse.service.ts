// 数据集版本文件解析（对应 Java FileParseDomainServiceImpl + JsonlFileParser + ParseContext；后端索引 §7.10）。
// 由 dataset-parse 队列消费者调用。失败在内部消化：任何异常 → 版本标记 PARSE_FAILED + ext.parseFailureReason，不上抛。
// 与 Java 的差异：从对象存储流式逐行读取（不整块进内存）；首行 UTF-8 BOM 自动去掉；
// bizId 超过列宽（64）按单行错误跳过而不是让整批插入失败。
import { StringDecoder } from 'node:string_decoder';
import type { Readable } from 'node:stream';
import type { ValidateFunction } from 'ajv';
import { sql } from 'kysely';
import type { Db } from '../../infra/db.js';
import type { NewDatasetSample } from '../../db/schema.js';
import { ServiceError } from '../../infra/errors.js';
import {
  briefValidationErrors,
  compileJsonSchema,
  isPlainObject,
  JsonSchemaError,
} from '../../infra/json-schema.js';
import type { Logger } from '../../infra/logger.js';
import type { ObjectStorage } from '../../infra/object-storage.js';
import type { LabelToolRepository } from '../labeltool/labeltool.repo.js';
import type { DatasetSampleRepository } from './dataset-sample.repo.js';
import type { DatasetVersionRepository } from './dataset-version.repo.js';
import { DELETED_NO, type DatasetRepository } from './dataset.repo.js';
import {
  fileTypeFromOssPath,
  UploadStatus,
  type DatasetVersionExt,
  type SampleError,
} from './enums.js';
import { DatasetErrorCode } from './error-codes.js';

export const PARSE_BATCH_SIZE = 1000;
export const MAX_SAMPLE_ERRORS = 100;
const FAILURE_REASON_MAX_LENGTH = 500;
/** markflow_dataset_sample.biz_id VARCHAR(64)。 */
const BIZ_ID_MAX_LENGTH = 64;
const INVALID_ROW_MESSAGE = '非法 JSON 行或非对象';

export interface DatasetParseServiceDeps {
  db: Db;
  datasets: DatasetRepository;
  versions: DatasetVersionRepository;
  samples: DatasetSampleRepository;
  labelTools: LabelToolRepository;
  storage: ObjectStorage;
  logger: Logger;
}

export interface ParseStats {
  totalCount: number;
  successCount: number;
  skippedCount: number;
  sampleErrors: SampleError[];
}

/**
 * 解析上下文：贯穿一次解析，承载 schema 校验、bizId 抽取、批量入库与统计。
 * 各格式解析器只负责拆行，每条内容都经由这里处理，保证行为一致。非线程安全（单次解析单线程）。
 */
export class ParseContext implements ParseStats {
  totalCount = 0;
  successCount = 0;
  skippedCount = 0;
  readonly sampleErrors: SampleError[] = [];
  private batch: NewDatasetSample[] = [];

  constructor(
    private readonly validate: ValidateFunction,
    private readonly datasetVersionId: number,
    private readonly operator: string | null,
    private readonly now: number,
    private readonly flusher: (rows: NewDatasetSample[]) => Promise<void>,
    private readonly batchSize = PARSE_BATCH_SIZE,
    private readonly maxErrors = MAX_SAMPLE_ERRORS,
  ) {}

  /** 一条解析成功的对象：schema 通过则抽 bizId、入批、计数，满批即刷库；不通过则跳过并记错。 */
  async acceptContent(content: Record<string, unknown>): Promise<void> {
    this.totalCount += 1;
    if (!this.validate(content)) {
      this.skip(`schema 校验失败: ${briefValidationErrors(this.validate.errors)}`);
      return;
    }
    const bizId = extractBizId(content);
    if (bizId !== null && bizId.length > BIZ_ID_MAX_LENGTH) {
      this.skip(`bizId 超过 ${BIZ_ID_MAX_LENGTH} 字符`);
      return;
    }
    this.batch.push({
      datasetVersionId: this.datasetVersionId,
      bizId,
      sampleDataJson: JSON.stringify(content),
      deleted: DELETED_NO,
      ext: null,
      creator: this.operator,
      operator: this.operator,
      createTime: this.now,
      updateTime: this.now,
    });
    this.successCount += 1;
    if (this.batch.length >= this.batchSize) await this.flush();
  }

  /** 一条格式错误的行：跳过并记错。 */
  recordParseError(message: string): void {
    this.totalCount += 1;
    this.skip(message);
  }

  /** 刷出剩余批次（解析结束时调用一次）。 */
  async flush(): Promise<void> {
    if (this.batch.length === 0) return;
    const rows = this.batch;
    this.batch = [];
    await this.flusher(rows);
  }

  private skip(message: string): void {
    this.skippedCount += 1;
    if (this.sampleErrors.length < this.maxErrors) {
      this.sampleErrors.push({ rowNumber: this.totalCount, error: message });
    }
  }
}

/** content.bizId：字符串 / 数字 / 布尔取其字符串形式（对应 Jackson asText），缺失、null、容器视为无。 */
function extractBizId(content: Record<string, unknown>): string | null {
  const v = content['bizId'];
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

/** 按 \r\n / \n / \r 拆行的流式行迭代器；跨块的 \r\n 最多多出一个空行（会被当空行跳过、不计数）。 */
export async function* iterateLines(stream: Readable): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  let buffered = '';
  for await (const chunk of stream) {
    buffered += decoder.write(chunk as Buffer);
    const parts = buffered.split(/\r\n|\r|\n/);
    buffered = parts.pop() ?? '';
    for (const part of parts) yield part;
  }
  buffered += decoder.end();
  if (buffered.length > 0) yield buffered;
}

/** JSONL：每个非空行须为一个 JSON 对象；空行跳过不计数；非法 JSON / 非对象记为解析失败。 */
export async function parseJsonlStream(stream: Readable, ctx: ParseContext): Promise<void> {
  let first = true;
  for await (let line of iterateLines(stream)) {
    if (first) {
      first = false;
      if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
    }
    if (line.trim() === '') continue;
    const content = tryParseJson(line);
    if (!isPlainObject(content)) ctx.recordParseError(INVALID_ROW_MESSAGE);
    else await ctx.acceptContent(content);
  }
}

function tryParseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/** 失败原因（写入 ext.parseFailureReason）：业务码取中文文案，其它取 name + message；超长截断。 */
export function describeParseFailure(err: unknown): string {
  let reason: string;
  if (err instanceof ServiceError) reason = err.message;
  else if (err instanceof JsonSchemaError) reason = `标注工具 JSON Schema 无法编译: ${err.message}`;
  else if (err instanceof Error) reason = `${err.name}: ${err.message}`;
  else reason = String(err);
  return reason.length <= FAILURE_REASON_MAX_LENGTH
    ? reason
    : `${reason.slice(0, FAILURE_REASON_MAX_LENGTH)}...`;
}

export class DatasetParseService {
  constructor(private readonly deps: DatasetParseServiceDeps) {}

  /** 同版本串行解析，数据库连接锁不会因大文件解析超过固定租期而失效。 */
  async parseDatasetVersion(versionId: number): Promise<void> {
    await this.deps.db.connection().execute(async (connection) => {
      const lockKey = `dataset-parse:${versionId}`;
      await sql`SELECT pg_advisory_lock(hashtextextended(${lockKey}, 0))`.execute(connection);
      try {
        const service = new DatasetParseService({
          ...this.deps,
          db: connection,
          datasets: this.deps.datasets.withDb(connection),
          versions: this.deps.versions.withDb(connection),
          samples: this.deps.samples.withDb(connection),
          labelTools: this.deps.labelTools.withDb(connection),
        });
        await service.parseLockedVersion(versionId);
      } finally {
        await sql`SELECT pg_advisory_unlock(hashtextextended(${lockKey}, 0))`.execute(connection);
      }
    });
  }

  private async parseLockedVersion(versionId: number): Promise<void> {
    const version = await this.deps.versions.selectById(versionId);
    if (!version || version.deleted !== DELETED_NO) {
      this.deps.logger.warn({ versionId }, 'dataset-parse skipped: version missing or deleted');
      return;
    }
    if (version.uploadStatus === UploadStatus.READY) return;
    try {
      const stats = await this.doParse(version);
      this.deps.logger.info(
        { versionId, ossPath: version.ossPath, ...stats, sampleErrors: undefined },
        'dataset-parse done',
      );
    } catch (err) {
      // 先落库标记失败，再打日志：日志本身出问题也不能让版本卡在 PARSING。
      try {
        await this.markFailed(version.id, version.sampleCount, version.creator, err);
      } finally {
        this.deps.logger.error(
          { err, versionId, ossPath: version.ossPath },
          'dataset-parse failed',
        );
      }
    }
  }

  private async doParse(version: {
    id: number;
    datasetId: number;
    ossPath: string | null;
    creator: string | null;
  }): Promise<ParseStats> {
    const dataset = await this.deps.datasets.selectById(version.datasetId);
    if (!dataset || dataset.deleted !== DELETED_NO) {
      throw ServiceError.of(DatasetErrorCode.DATASET_NOT_FOUND);
    }
    const tool = dataset.serviceObjName
      ? await this.deps.labelTools.selectByCode(dataset.serviceObjName)
      : undefined;
    const schema = tool?.labelToolJsonSchema;
    if (!tool || !isPlainObject(schema)) {
      throw ServiceError.of(DatasetErrorCode.LABEL_TOOL_SCHEMA_MISSING);
    }
    if (fileTypeFromOssPath(version.ossPath) === null) {
      throw ServiceError.of(DatasetErrorCode.UNSUPPORTED_FILE_TYPE);
    }
    const validate = compileJsonSchema(schema, { allErrors: true });

    // 仅未就绪版本重试时清理部分样本；READY 版本及其源样本主键不可变。
    await this.deps.samples.deleteByVersionId(version.id);

    const stream = await this.deps.storage.getObjectStream(version.ossPath as string);
    const ctx = new ParseContext(validate, version.id, version.creator, Date.now(), (rows) =>
      this.deps.samples.batchInsert(rows),
    );
    try {
      await parseJsonlStream(stream, ctx);
    } finally {
      stream.destroy();
    }
    await ctx.flush();

    const ext: DatasetVersionExt = {
      totalRowCount: ctx.totalCount,
      successRowCount: ctx.successCount,
      skippedRowCount: ctx.skippedCount,
      sampleErrors: ctx.sampleErrors,
      parseFailureReason: null,
    };
    await this.deps.versions.updateParseResult(
      version.id,
      UploadStatus.READY,
      ctx.successCount,
      ext,
      version.creator,
      Date.now(),
    );
    return {
      totalCount: ctx.totalCount,
      successCount: ctx.successCount,
      skippedCount: ctx.skippedCount,
      sampleErrors: ctx.sampleErrors,
    };
  }

  private async markFailed(
    versionId: number,
    sampleCount: number,
    operator: string | null,
    err: unknown,
  ): Promise<void> {
    const ext: DatasetVersionExt = {
      totalRowCount: null,
      successRowCount: null,
      skippedRowCount: null,
      sampleErrors: null,
      parseFailureReason: describeParseFailure(err),
    };
    try {
      await this.deps.versions.updateParseResult(
        versionId,
        UploadStatus.PARSE_FAILED,
        sampleCount,
        ext,
        operator,
        Date.now(),
      );
    } catch (markErr) {
      this.deps.logger.error({ err: markErr, versionId }, 'marking version PARSE_FAILED failed');
      throw markErr;
    }
  }
}
