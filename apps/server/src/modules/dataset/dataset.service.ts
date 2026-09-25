// 数据集领域服务（对应 Java DatasetDomainServiceImpl；规则见后端索引 §3.6 / §7.10）。
// 权限：系统管理员 或 该空间 LABEL_ADMIN（按 spaceCode 查空间，不存在 → WORKSPACE_NOT_FOUND）。
// 与 Java 的差异：
// - 建数据集 / 建版本在 Kysely 事务内落库并写 outbox，提交后投递 dataset-parse（投递失败由 outbox 定时重投）；
// - 空间内同名还有部分唯一索引兜底（迁移 0002）；建版本时对 dataset 行 FOR UPDATE，版本号唯一键冲突转 OPERATION_CONFLICT；
// - getUploadPreSignedUrl 收紧为「系统管理员 或 任意空间 LABEL_ADMIN」（Java 任何登录用户可用，索引 §9.4）；
// - 对象 key 的日期段按 MARKFLOW_TIMEZONE 取当天。
import { randomUUID } from 'node:crypto';
import { isUniqueViolation, type Db } from '../../infra/db.js';
import { ServiceError } from '../../infra/errors.js';
import type { RedisLock } from '../../infra/lock.js';
import type { Logger } from '../../infra/logger.js';
import type { ObjectStorage } from '../../infra/object-storage.js';
import type { OutboxService } from '../../infra/outbox.js';
import { QUEUE_NAMES } from '../../infra/queue.js';
import type { Operator } from '../common/operator.js';
import { datePart } from '../common/datetime.js';
import { emptyPage, normalizePage, type PageInput, type PageResult } from '../common/pagination.js';
import type { PermissionService } from '../common/permission.js';
import { hasText, isBlank, type Maybe } from '../common/strings.js';
import { LabelToolErrorCode } from '../labeltool/error-codes.js';
import type { LabelToolRepository } from '../labeltool/labeltool.repo.js';
import { WorkspaceErrorCode } from '../workspace/error-codes.js';
import type { WorkspaceRepository } from '../workspace/workspace.repo.js';
import type { DatasetSampleRepository } from './dataset-sample.repo.js';
import type { DatasetVersionRepository } from './dataset-version.repo.js';
import { DELETED_NO, type DatasetRepository } from './dataset.repo.js';
import { DatasetType, UploadStatus } from './enums.js';
import { DatasetErrorCode } from './error-codes.js';

const NAME_MIN_LENGTH = 4;
const NAME_MAX_LENGTH = 32;
const DESC_MAX_LENGTH = 512;
const VERSION_DESC_MAX_LENGTH = 512;
const INIT_VERSION_NUMBER = 1;
const INIT_SAMPLE_COUNT = 0;
const PREVIEW_SAMPLE_LIMIT = 10;
const UPLOAD_KEY_PREFIX = 'dataset';
const UPLOAD_PRESIGN_EXPIRES_SECONDS = 3600;
const UPLOAD_HTTP_METHOD = 'PUT';
/** 只保留字母数字后缀（≤16 位），其余当作无后缀：防止把奇怪文件名拼进对象 key。 */
const SUFFIX_PATTERN = /^[A-Za-z0-9]{1,16}$/;

export interface CreateDatasetInput {
  spaceCode?: Maybe<string>;
  datasetName?: Maybe<string>;
  datasetDesc?: Maybe<string>;
  labelToolCode?: Maybe<string>;
  ossPath?: Maybe<string>;
  versionDesc?: Maybe<string>;
}

export interface CreateDatasetVersionInput {
  datasetId?: Maybe<number>;
  ossPath?: Maybe<string>;
  versionDesc?: Maybe<string>;
}

export interface DatasetListInput extends PageInput {
  spaceCode?: Maybe<string>;
  keyword?: Maybe<string>;
}

export interface DatasetListItem {
  datasetId: number;
  datasetName: string;
  datasetDesc: string | null;
  labelToolCode: string | null;
  latestVersionNumber: number;
  creator: string | null;
  createTime: number;
}

export interface DatasetVersionItem {
  versionId: number;
  versionNumber: number;
  versionDesc: string | null;
  uploadStatus: number;
  sampleCount: number;
  creator: string | null;
  createTime: number;
  /** 解析统计 + 失败明细（DatasetVersionExt）；未解析为 null。 */
  parseExt: unknown;
}

export interface DatasetDetail extends DatasetListItem {
  spaceCode: string;
  versions: DatasetVersionItem[];
}

export interface SamplePreviewItem {
  id: number;
  bizId: string | null;
  sampleData: unknown;
}

export interface UploadPresignResult {
  objectKey: string;
  uploadUrl: string;
  httpMethod: string;
  signedHeaders: Record<string, string>;
  expiresInSeconds: number;
}

export interface DatasetServiceDeps {
  db: Db;
  datasets: DatasetRepository;
  versions: DatasetVersionRepository;
  samples: DatasetSampleRepository;
  labelTools: LabelToolRepository;
  workspaces: WorkspaceRepository;
  permissions: PermissionService;
  lock: RedisLock;
  storage: ObjectStorage;
  outbox: OutboxService;
  logger: Logger;
  /** 对象 key 日期段所用时区（MARKFLOW_TIMEZONE）。 */
  timeZone: string;
}

export class DatasetService {
  constructor(private readonly deps: DatasetServiceDeps) {}

  /** 顺序与 Java 一致：空间 + 权限 → 参数 → 标注工具存在 → 锁内查重 → 事务落库 → 入队解析。 */
  async createDataset(
    operator: Operator,
    input: CreateDatasetInput,
  ): Promise<{ datasetId: number; versionId: number; versionNumber: number }> {
    const workspace = await this.requireManageableWorkspace(operator.userId, input.spaceCode);
    const params = validateCreateParam(input);
    if (!(await this.deps.labelTools.selectByCode(params.labelToolCode))) {
      throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_NOT_FOUND);
    }
    const spaceCode = workspace.spaceCode;
    const lockName = `dataset:create:${spaceCode.toLowerCase()}:${params.datasetName.toLowerCase()}`;
    const created = await this.deps.lock.withLock(
      lockName,
      DatasetErrorCode.OPERATION_CONFLICT,
      async () => {
        if (
          await this.deps.datasets.selectActiveBySpaceCodeAndName(spaceCode, params.datasetName)
        ) {
          throw ServiceError.of(DatasetErrorCode.DATASET_NAME_EXISTS);
        }
        const now = Date.now();
        try {
          return await this.deps.db.transaction().execute(async (trx) => {
            const datasetId = await this.deps.datasets.withDb(trx).insert({
              spaceCode,
              datasetName: params.datasetName,
              datasetDesc: params.datasetDesc,
              datasetType: DatasetType.ANNOTATION,
              serviceObjName: params.labelToolCode,
              latestVersionNumber: INIT_VERSION_NUMBER,
              deleted: DELETED_NO,
              ext: null,
              creator: operator.username,
              operator: operator.username,
              createTime: now,
              updateTime: now,
            });
            const versionId = await this.deps.versions.withDb(trx).insert({
              datasetId,
              versionNumber: INIT_VERSION_NUMBER,
              versionDesc: params.versionDesc,
              ossPath: params.ossPath,
              uploadStatus: UploadStatus.PARSING,
              sampleCount: INIT_SAMPLE_COUNT,
              deleted: DELETED_NO,
              ext: null,
              creator: operator.username,
              operator: operator.username,
              createTime: now,
              updateTime: now,
            });
            const outboxId = await this.enqueueParseTx(trx, versionId);
            return { datasetId, versionId, outboxId };
          });
        } catch (err) {
          if (isUniqueViolation(err, 'uk_dataset_space_name_active')) {
            throw ServiceError.of(DatasetErrorCode.DATASET_NAME_EXISTS);
          }
          throw err;
        }
      },
    );
    await this.deps.outbox.deliver([created.outboxId]);
    return {
      datasetId: created.datasetId,
      versionId: created.versionId,
      versionNumber: INIT_VERSION_NUMBER,
    };
  }

  /** 数据集存在 → 权限（按 dataset.spaceCode）→ 参数 → 锁内事务：行锁重读 latest+1、插版本、回写 latest → 入队。 */
  async createDatasetVersion(
    operator: Operator,
    input: CreateDatasetVersionInput,
  ): Promise<{ versionId: number; versionNumber: number }> {
    const dataset = await this.requireActiveDataset(input.datasetId);
    await this.requireManageableWorkspace(operator.userId, dataset.spaceCode);
    const params = validateVersionParam(input);
    const created = await this.deps.lock.withLock(
      `dataset:version:${dataset.id}`,
      DatasetErrorCode.OPERATION_CONFLICT,
      async () => {
        try {
          return await this.deps.db.transaction().execute(async (trx) => {
            const datasets = this.deps.datasets.withDb(trx);
            const current = await datasets.selectByIdForUpdate(dataset.id);
            if (!current || current.deleted !== DELETED_NO) {
              throw ServiceError.of(DatasetErrorCode.DATASET_NOT_FOUND);
            }
            const versionNumber = current.latestVersionNumber + 1;
            const now = Date.now();
            const versionId = await this.deps.versions.withDb(trx).insert({
              datasetId: dataset.id,
              versionNumber,
              versionDesc: params.versionDesc,
              ossPath: params.ossPath,
              uploadStatus: UploadStatus.PARSING,
              sampleCount: INIT_SAMPLE_COUNT,
              deleted: DELETED_NO,
              ext: null,
              creator: operator.username,
              operator: operator.username,
              createTime: now,
              updateTime: now,
            });
            await datasets.updateLatestVersionNumber(
              dataset.id,
              versionNumber,
              operator.username,
              now,
            );
            const outboxId = await this.enqueueParseTx(trx, versionId);
            return { versionId, versionNumber, outboxId };
          });
        } catch (err) {
          if (isUniqueViolation(err, 'uk_dataset_version')) {
            throw ServiceError.of(DatasetErrorCode.OPERATION_CONFLICT);
          }
          throw err;
        }
      },
    );
    await this.deps.outbox.deliver([created.outboxId]);
    return { versionId: created.versionId, versionNumber: created.versionNumber };
  }

  async getDatasetList(
    operatorId: number,
    input: DatasetListInput,
  ): Promise<PageResult<DatasetListItem>> {
    const workspace = await this.requireManageableWorkspace(operatorId, input.spaceCode);
    const page = normalizePage(input);
    const total = await this.deps.datasets.countByCondition(workspace.spaceCode, input.keyword);
    if (total === 0) return emptyPage(page);
    const rows = await this.deps.datasets.selectByCondition(
      workspace.spaceCode,
      input.keyword,
      page.offset,
      page.pageSize,
    );
    return { list: rows.map(toListItem), total, pageNum: page.pageNum, pageSize: page.pageSize };
  }

  async getDatasetDetail(
    operatorId: number,
    input: { datasetId?: Maybe<number> },
  ): Promise<DatasetDetail> {
    const dataset = await this.requireActiveDataset(input.datasetId);
    await this.requireManageableWorkspace(operatorId, dataset.spaceCode);
    const versions = await this.deps.versions.selectActiveByDatasetId(dataset.id);
    return {
      ...toListItem(dataset),
      spaceCode: dataset.spaceCode,
      versions: versions.map((v) => ({
        versionId: v.id,
        versionNumber: v.versionNumber,
        versionDesc: v.versionDesc,
        uploadStatus: v.uploadStatus,
        sampleCount: v.sampleCount,
        creator: v.creator,
        createTime: v.createTime,
        parseExt: v.ext,
      })),
    };
  }

  /** 版本存在 → 数据集存在 → 权限 → 前 10 条（id 升序）。 */
  async getVersionSamplePreview(
    operatorId: number,
    input: { versionId?: Maybe<number> },
  ): Promise<{ list: SamplePreviewItem[] }> {
    const version =
      typeof input.versionId === 'number'
        ? await this.deps.versions.selectById(input.versionId)
        : undefined;
    if (!version || version.deleted !== DELETED_NO) {
      throw ServiceError.of(DatasetErrorCode.DATASET_VERSION_NOT_FOUND);
    }
    const dataset = await this.requireActiveDataset(version.datasetId);
    await this.requireManageableWorkspace(operatorId, dataset.spaceCode);
    const rows = await this.deps.samples.selectPreviewByVersionId(version.id, PREVIEW_SAMPLE_LIMIT);
    return {
      list: rows.map((s) => ({ id: s.id, bizId: s.bizId, sampleData: s.sampleDataJson })),
    };
  }

  /**
   * 预签名 PUT 直传：key = dataset/{yyyyMMdd}/{uuid32}{.后缀}，只保留原文件后缀、不回用原文件名（防覆盖、防路径注入）。
   * 权限：系统管理员 或 任意空间 LABEL_ADMIN（能建数据集的人）。
   */
  async getUploadPreSignedUrl(
    operatorId: number,
    input: { fileName?: Maybe<string> },
  ): Promise<UploadPresignResult> {
    await this.deps.permissions.checkCanViewGlobalAssets(operatorId);
    if (isBlank(input.fileName)) {
      throw ServiceError.of(DatasetErrorCode.UPLOAD_FILE_NAME_REQUIRED);
    }
    const objectKey = buildUploadObjectKey(input.fileName as string, this.deps.timeZone);
    const presigned = await this.deps.storage.presignPut(objectKey, UPLOAD_PRESIGN_EXPIRES_SECONDS);
    return {
      objectKey,
      uploadUrl: presigned.url,
      httpMethod: UPLOAD_HTTP_METHOD,
      signedHeaders: presigned.signedHeaders,
      expiresInSeconds: presigned.expiresInSeconds,
    };
  }

  /** 可管理数据集 = 系统管理员 或 空间 LABEL_ADMIN；空间不存在（含 spaceCode 空）抛 WORKSPACE_NOT_FOUND。 */
  private async requireManageableWorkspace(operatorId: number, spaceCode: Maybe<string>) {
    const workspace = hasText(spaceCode)
      ? await this.deps.workspaces.selectBySpaceCode(spaceCode)
      : undefined;
    if (!workspace) throw ServiceError.of(WorkspaceErrorCode.WORKSPACE_NOT_FOUND);
    await this.deps.permissions.checkCanManageWorkspace(workspace.id, operatorId);
    return workspace;
  }

  private async requireActiveDataset(datasetId: Maybe<number>) {
    const dataset =
      typeof datasetId === 'number' ? await this.deps.datasets.selectById(datasetId) : undefined;
    if (!dataset || dataset.deleted !== DELETED_NO) {
      throw ServiceError.of(DatasetErrorCode.DATASET_NOT_FOUND);
    }
    return dataset;
  }

  /** 事务内写 outbox 行（jobId 沿用 version-<id> 去重）；提交后由调用方 deliver。 */
  private enqueueParseTx(trx: Db, versionId: number): Promise<number> {
    return this.deps.outbox.enqueueTx(trx, {
      queue: QUEUE_NAMES.datasetParse,
      jobName: 'parse',
      jobId: `version-${versionId}`,
      payload: { versionId },
    });
  }
}

function toListItem(d: {
  id: number;
  datasetName: string;
  datasetDesc: string | null;
  serviceObjName: string | null;
  latestVersionNumber: number;
  creator: string | null;
  createTime: number;
}): DatasetListItem {
  return {
    datasetId: d.id,
    datasetName: d.datasetName,
    datasetDesc: d.datasetDesc,
    labelToolCode: d.serviceObjName,
    latestVersionNumber: d.latestVersionNumber,
    creator: d.creator,
    createTime: d.createTime,
  };
}

interface CreateParams {
  datasetName: string;
  datasetDesc: string | null;
  labelToolCode: string;
  ossPath: string;
  versionDesc: string | null;
}

/** 与 Java validateParam 顺序一致：name 4-32 → desc ≤ 512 → ossPath 必填 → labelToolCode 必填。 */
function validateCreateParam(input: CreateDatasetInput): CreateParams {
  const name = input.datasetName;
  if (typeof name !== 'string' || name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    throw ServiceError.of(DatasetErrorCode.DATASET_NAME_INVALID);
  }
  const desc = input.datasetDesc ?? null;
  if (desc !== null && desc.length > DESC_MAX_LENGTH) {
    throw ServiceError.of(DatasetErrorCode.DATASET_DESC_TOO_LONG);
  }
  if (isBlank(input.ossPath)) throw ServiceError.of(DatasetErrorCode.OSS_PATH_REQUIRED);
  if (isBlank(input.labelToolCode)) {
    throw ServiceError.of(DatasetErrorCode.LABEL_TOOL_CODE_REQUIRED);
  }
  return {
    datasetName: name,
    datasetDesc: desc,
    labelToolCode: input.labelToolCode as string,
    ossPath: input.ossPath as string,
    versionDesc: input.versionDesc ?? null,
  };
}

function validateVersionParam(input: CreateDatasetVersionInput): {
  ossPath: string;
  versionDesc: string | null;
} {
  if (isBlank(input.ossPath)) throw ServiceError.of(DatasetErrorCode.OSS_PATH_REQUIRED);
  const versionDesc = input.versionDesc ?? null;
  if (versionDesc !== null && versionDesc.length > VERSION_DESC_MAX_LENGTH) {
    throw ServiceError.of(DatasetErrorCode.VERSION_DESC_TOO_LONG);
  }
  return { ossPath: input.ossPath as string, versionDesc };
}

/** 取文件名后缀（含点，如 `.jsonl`）；无后缀或后缀含非字母数字返回空串。 */
export function extractSuffix(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return '';
  const suffix = fileName.slice(dot + 1);
  return SUFFIX_PATTERN.test(suffix) ? `.${suffix}` : '';
}

export function buildUploadObjectKey(fileName: string, timeZone: string): string {
  const unique = randomUUID().replace(/-/g, '');
  return `${UPLOAD_KEY_PREFIX}/${datePart(timeZone)}/${unique}${extractSuffix(fileName)}`;
}
