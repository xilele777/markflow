// Case 领域服务（对应 Java CaseDomainServiceImpl；规则表 0004 §1 创建、§2 查询、§8.1 导出触发）。
// 与 Java 的差异：STREAM 模式拒绝；列表 / 详情要求空间成员或系统管理员；
// 详情里 lastExport.downloadUrl 按 objectKey 现签预签名 GET；创建时入首池与 case 同事务、提交后 dispatchPool。
import type { CaseRow } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import type { RedisLock } from '../../infra/lock.js';
import type { Logger } from '../../infra/logger.js';
import type { ObjectStorage } from '../../infra/object-storage.js';
import type { OutboxService } from '../../infra/outbox.js';
import { QUEUE_NAMES } from '../../infra/queue.js';
import type { AiConfigService } from '../aiconfig/aiconfig.service.js';
import { AiConfigErrorCode } from '../aiconfig/error-codes.js';
import type { Operator } from '../common/operator.js';
import { emptyPage, normalizePage, type PageInput, type PageResult } from '../common/pagination.js';
import type { PermissionService } from '../common/permission.js';
import { hasText, isBlank, type Maybe } from '../common/strings.js';
import type { DatasetSampleRepository } from '../dataset/dataset-sample.repo.js';
import type { DatasetVersionRepository } from '../dataset/dataset-version.repo.js';
import { DatasetType, UploadStatus } from '../dataset/enums.js';
import { LabelToolErrorCode } from '../labeltool/error-codes.js';
import type { LabelToolRepository } from '../labeltool/labeltool.repo.js';
import { UserErrorCode } from '../user/error-codes.js';
import type { UserRepository } from '../user/user.repo.js';
import { WorkspaceErrorCode } from '../workspace/error-codes.js';
import type { MembershipRepository } from '../workspace/membership.repo.js';
import type { WorkspaceRepository } from '../workspace/workspace.repo.js';
import {
  NotificationRefType,
  NotificationType,
  type NotificationService,
} from '../notification/notification.service.js';
import { DELETED_NO, type CaseRepository } from './case.repo.js';
import {
  isMemberActive,
  planStages,
  readCaseExt,
  readTaskPlan,
  type AiStageConfig,
  type AssignmentConfig,
  type HumanStageConfig,
  type MemberConfig,
  type TaskPlanConfig,
} from './config.js';
import type { DispatchEngine } from './dispatch-engine.js';
import {
  CaseExportStatus,
  CaseStatus,
  DataSourceType,
  EXPORT_FORMATS,
  isCaseStatusCode,
  isDataSourceTypeCode,
  isStrategyCode,
  stageByType,
  Strategy,
  TASK_GROUP_TYPE_DESC,
  TaskGroupStatus,
  TaskStatus,
  TaskGroupType,
  type ExportFormat,
  type StageDef,
} from './enums.js';
import { CaseErrorCode } from './error-codes.js';
import type { TaskGroupRepository } from './task-group.repo.js';
import type { TaskRepository } from './task.repo.js';

const CASE_NAME_MAX_LENGTH = 255;
const DESCRIPTION_MAX_LENGTH = 1024;
const RATIO_TOTAL = 100;
const CREATE_LOCK = { waitMs: 3_000, leaseMs: 30_000 };
const DOWNLOAD_URL_EXPIRES_SECONDS = 3600;
const STATUS_LOCK = { waitMs: 3_000, leaseMs: 30_000 };
/** 截止前多久发一次提醒。 */
export const DEADLINE_REMINDER_AHEAD_MS = 24 * 60 * 60 * 1000;
const DEADLINE_SCAN_LIMIT = 500;
/** 手工可切换的目标状态与允许的来源状态。 */
const STATUS_TRANSITIONS: Record<number, readonly number[]> = {
  [CaseStatus.RUNNING]: [CaseStatus.PAUSED],
  [CaseStatus.PAUSED]: [CaseStatus.RUNNING],
  [CaseStatus.FINISHED]: [CaseStatus.RUNNING, CaseStatus.PAUSED],
};
const POOL_PENDING_STATUSES: readonly number[] = [TaskStatus.PENDING_DISPATCH, TaskStatus.REWORK];
const PERSONAL_DOING_STATUSES: readonly number[] = [
  TaskStatus.LABELING,
  TaskStatus.REVIEWING,
  TaskStatus.REWORK,
];

/** wire 入参（zod 只保证 JSON 类型；语义校验在这里）。 */
export interface CreateCaseInput {
  spaceCode?: Maybe<string>;
  name?: Maybe<string>;
  description?: Maybe<string>;
  dataSourceType?: Maybe<number>;
  datasetVersionId?: Maybe<number>;
  labelTool?: Maybe<string>;
  taskPlanConfig?: Maybe<{
    stages?: Maybe<Array<Maybe<{ stage?: Maybe<number>; type?: Maybe<string> }>>>;
  }>;
  assignmentConfig?: Maybe<{
    aiPreLabel?: Maybe<AiStageInput>;
    label?: Maybe<HumanStageInput>;
    aiPreReview?: Maybe<AiStageInput>;
    review?: Maybe<HumanStageInput>;
    recheck?: Maybe<HumanStageInput>;
  }>;
  /** 截止时间（毫秒，M5）；可省略。 */
  deadline?: Maybe<number>;
}

export interface AiStageInput {
  aiCode?: Maybe<string>;
  preDispatchSize?: Maybe<number>;
  autoRecycleMinutes?: Maybe<number>;
}

export interface HumanStageInput {
  strategy?: Maybe<number>;
  preDispatchSize?: Maybe<number>;
  autoRecycleMinutes?: Maybe<number>;
  members?: Maybe<
    Array<Maybe<{ username?: Maybe<string>; ratio?: Maybe<number>; active?: Maybe<boolean> }>>
  >;
}

export interface CaseListItem {
  caseId: number;
  name: string;
  description: string | null;
  dataSourceType: number;
  status: number;
  labelToolCode: string;
  creator: string | null;
  createTime: number;
  /** 截止时间（毫秒），未设置为 null。 */
  deadline: number | null;
}

export interface StageProgress {
  stageType: string;
  taskType: number;
  poolPending: number;
  personalDoing: number;
  done: number;
}

export interface CaseDetail {
  caseId: number;
  spaceCode: string;
  name: string;
  description: string | null;
  dataSourceType: number;
  datasetVersionId: number | null;
  labelToolCode: string;
  status: number;
  creator: string | null;
  createTime: number;
  updateTime: number;
  taskPlanConfig: unknown;
  assignmentConfig: unknown;
  labelResultDatasetVersionId: number | null;
  stageProgress: StageProgress[];
  ext: unknown;
}

export interface CaseServiceDeps {
  db: Db;
  cases: CaseRepository;
  groups: TaskGroupRepository;
  tasks: TaskRepository;
  samples: DatasetSampleRepository;
  versions: DatasetVersionRepository;
  labelTools: LabelToolRepository;
  workspaces: WorkspaceRepository;
  memberships: MembershipRepository;
  users: UserRepository;
  aiConfigs: AiConfigService;
  permissions: PermissionService;
  dispatch: DispatchEngine;
  lock: RedisLock;
  outbox: OutboxService;
  storage: ObjectStorage;
  notifications: NotificationService;
  logger: Logger;
  /** 截止时间文案用的 IANA 时区。 */
  timeZone: string;
}

export class CaseService {
  constructor(private readonly deps: CaseServiceDeps) {}

  async createCase(operator: Operator, input: CreateCaseInput): Promise<{ caseId: number }> {
    // 边界校验（对应 Controller）：dataSourceType → stages → stage.type → assignmentConfig → strategy
    if (!isDataSourceTypeCode(input.dataSourceType)) {
      throw ServiceError.of(CaseErrorCode.DATA_SOURCE_TYPE_INVALID);
    }
    const plan = buildTaskPlan(input.taskPlanConfig);
    const assignment = buildAssignment(input.assignmentConfig);

    const workspace = await this.requireManageableWorkspace(operator.userId, input.spaceCode);
    const name = validateBasic(input);
    if (input.dataSourceType === DataSourceType.STREAM) {
      throw ServiceError.of(CaseErrorCode.DATA_SOURCE_TYPE_INVALID, '流式模式暂不支持');
    }
    const labelTool = input.labelTool as string;
    if (!(await this.deps.labelTools.selectByCode(labelTool))) {
      throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_NOT_FOUND);
    }
    const versionId = await this.validateDatasetVersion(
      input.datasetVersionId,
      workspace.spaceCode,
      labelTool,
    );
    const stages = validateTaskPlan(plan);
    await this.validateAssignment(assignment, stages, labelTool, workspace.id);
    const deadline = validateDeadline(input.deadline);

    const spaceCode = workspace.spaceCode;
    const lockName = `case:create:${spaceCode.toLowerCase()}:${name.toLowerCase()}`;
    const firstStage = stages[0] as StageDef;
    const caseId = await this.deps.lock.withLock(
      lockName,
      CaseErrorCode.OPERATION_CONFLICT,
      async () => {
        if (await this.deps.cases.existsActiveBySpaceCodeAndName(spaceCode, name)) {
          throw ServiceError.of(CaseErrorCode.CASE_NAME_EXISTS);
        }
        return this.deps.db.transaction().execute(async (trx) => {
          const now = Date.now();
          const id = await this.deps.cases.withDb(trx).insert({
            spaceCode,
            name,
            description: input.description ?? null,
            dataSourceType: DataSourceType.DATASET,
            datasetVersionId: versionId,
            labelResultDatasetVersionId: null,
            labelToolCode: labelTool,
            taskPlanConfig: JSON.stringify(plan),
            assignmentConfig: JSON.stringify(assignment),
            status: CaseStatus.RUNNING,
            version: 0,
            deleted: DELETED_NO,
            ext: deadline === null ? null : JSON.stringify({ deadline }),
            creator: operator.username,
            operator: operator.username,
            createTime: now,
            updateTime: now,
          });
          const groups = this.deps.groups.withDb(trx);
          for (const stage of stages) {
            await groups.insert({
              caseId: id,
              stage: stage.code,
              type: stage.poolType,
              annotator: null,
              name: TASK_GROUP_TYPE_DESC[stage.poolType] ?? null,
              labelToolCode: labelTool,
              status: TaskGroupStatus.PENDING,
              totalCount: 0,
              doneCount: 0,
              costTime: 0,
              ext: null,
              createTime: now,
              updateTime: now,
            });
          }
          const sampleIds = await this.deps.samples.withDb(trx).selectIdListByVersionId(versionId);
          await this.deps.dispatch.enqueueToPool(
            trx,
            id,
            firstStage.poolType,
            sampleIds,
            operator.username,
          );
          return id;
        });
      },
      CREATE_LOCK,
    );
    await this.deps.dispatch.dispatchPoolQuietly(caseId, firstStage.poolType);
    return { caseId };
  }

  async getCaseList(
    operator: Operator,
    input: PageInput & {
      spaceCode?: Maybe<string>;
      status?: Maybe<number>;
      keyword?: Maybe<string>;
    },
  ): Promise<PageResult<CaseListItem>> {
    if (input.status !== null && input.status !== undefined && !isCaseStatusCode(input.status)) {
      throw ServiceError.of(CommonErrorCode.PARAM_INVALID, 'status 不合法');
    }
    const workspace = await this.requireViewableWorkspace(operator.userId, input.spaceCode);
    const page = normalizePage(input);
    const total = await this.deps.cases.countByCondition(
      workspace.spaceCode,
      input.status,
      input.keyword,
    );
    if (total === 0) return emptyPage(page);
    const rows = await this.deps.cases.selectByCondition(
      workspace.spaceCode,
      input.status,
      input.keyword,
      page.offset,
      page.pageSize,
    );
    return {
      list: rows.map((c) => ({
        caseId: c.id,
        name: c.name,
        description: c.description,
        dataSourceType: c.dataSourceType,
        status: c.status,
        labelToolCode: c.labelToolCode,
        creator: c.creator,
        createTime: c.createTime,
        deadline: readCaseExt(c.ext).deadline ?? null,
      })),
      total,
      pageNum: page.pageNum,
      pageSize: page.pageSize,
    };
  }

  async getCaseDetail(operator: Operator, input: { caseId?: Maybe<number> }): Promise<CaseDetail> {
    const caseRow = await this.requireActiveCase(input.caseId);
    await this.requireViewableWorkspace(operator.userId, caseRow.spaceCode);
    return {
      caseId: caseRow.id,
      spaceCode: caseRow.spaceCode,
      name: caseRow.name,
      description: caseRow.description,
      dataSourceType: caseRow.dataSourceType,
      datasetVersionId: caseRow.datasetVersionId,
      labelToolCode: caseRow.labelToolCode,
      status: caseRow.status,
      creator: caseRow.creator,
      createTime: caseRow.createTime,
      updateTime: caseRow.updateTime,
      taskPlanConfig: caseRow.taskPlanConfig,
      assignmentConfig: caseRow.assignmentConfig,
      labelResultDatasetVersionId: caseRow.labelResultDatasetVersionId,
      stageProgress: await this.buildStageProgress(caseRow),
      ext: await this.buildExt(caseRow),
    };
  }

  /** 导出触发：格式 → case → 权限 → ext.lastExport=EXPORTING → outbox。 */
  async exportCaseResult(
    operator: Operator,
    input: { caseId?: Maybe<number>; format?: Maybe<string> },
  ): Promise<void> {
    const format = hasText(input.format) ? input.format.toLowerCase() : '';
    if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
      throw ServiceError.of(CaseErrorCode.EXPORT_FORMAT_INVALID);
    }
    const caseRow = await this.requireActiveCase(input.caseId);
    await this.requireManageableWorkspace(operator.userId, caseRow.spaceCode);
    const now = Date.now();
    const outboxId = await this.deps.db.transaction().execute(async (trx) => {
      await this.deps.cases
        .withDb(trx)
        .updateExt(
          caseRow.id,
          { lastExport: { status: CaseExportStatus.EXPORTING, format, triggerTime: now } },
          operator.username,
          now,
        );
      return this.deps.outbox.enqueueTx(trx, {
        queue: QUEUE_NAMES.caseExport,
        jobName: 'export',
        payload: {
          caseId: caseRow.id,
          format: format as ExportFormat,
          operator: operator.username,
        },
      });
    });
    await this.deps.outbox.deliver([outboxId]);
  }

  /**
   * 状态控制（M5）：RUNNING ⇄ PAUSED，RUNNING / PAUSED → FINISHED；FINISHED 为终态。
   * 暂停后派发引擎直接返回 0、已在手任务仍可提交；恢复后对流程内每个池补一次派发。
   */
  async updateCaseStatus(
    operator: Operator,
    input: { caseId?: Maybe<number>; status?: Maybe<number> },
  ): Promise<{ caseId: number; status: number }> {
    const target = input.status;
    if (typeof target !== 'number' || !(target in STATUS_TRANSITIONS)) {
      throw ServiceError.of(CaseErrorCode.CASE_STATUS_INVALID);
    }
    const caseRow = await this.requireActiveCase(input.caseId);
    await this.requireManageableWorkspace(operator.userId, caseRow.spaceCode);
    const allowedFrom = STATUS_TRANSITIONS[target] as readonly number[];
    await this.deps.lock.withLock(
      `case:status:${caseRow.id}`,
      CaseErrorCode.OPERATION_CONFLICT,
      async () => {
        const fresh = await this.requireActiveCase(caseRow.id);
        if (fresh.status === target) return;
        if (!allowedFrom.includes(fresh.status)) {
          throw ServiceError.of(CaseErrorCode.CASE_STATUS_TRANSITION_INVALID);
        }
        const affected = await this.deps.cases.updateStatus(
          fresh.id,
          allowedFrom,
          target,
          operator.username,
          Date.now(),
        );
        if (affected === 0) throw ServiceError.of(CaseErrorCode.OPERATION_CONFLICT);
        this.deps.logger.info(
          { caseId: fresh.id, from: fresh.status, to: target, operator: operator.username },
          'case status updated',
        );
      },
      STATUS_LOCK,
    );
    if (target === CaseStatus.RUNNING) {
      for (const stage of planStages(readTaskPlan(caseRow.taskPlanConfig))) {
        await this.deps.dispatch.dispatchPoolQuietly(caseRow.id, stage.poolType);
      }
    }
    return { caseId: caseRow.id, status: target };
  }

  /** 设置 / 清除截止时间（M5）：deadline 为 null 清除；重设后提醒 / 逾期标记清零。 */
  async updateCaseDeadline(
    operator: Operator,
    input: { caseId?: Maybe<number>; deadline?: Maybe<number> },
  ): Promise<{ caseId: number; deadline: number | null }> {
    const deadline = validateDeadline(input.deadline);
    const caseRow = await this.requireActiveCase(input.caseId);
    await this.requireManageableWorkspace(operator.userId, caseRow.spaceCode);
    if (caseRow.status === CaseStatus.FINISHED) throw ServiceError.of(CaseErrorCode.CASE_FINISHED);
    await this.deps.cases.updateExt(
      caseRow.id,
      { deadline, deadlineReminderAt: null, deadlineOverdueAt: null },
      operator.username,
      Date.now(),
    );
    return { caseId: caseRow.id, deadline };
  }

  /**
   * 截止扫描（定时器每分钟调一次）：运行中且设了 deadline 的 case，
   * 距截止 ≤ 24h 且未提醒过 → CASE_DEADLINE「即将到期」；已过截止且未通知过 → CASE_DEADLINE「已逾期」。
   * 收件人：case 创建人 + 该空间全部 LABEL_ADMIN（去重）。返回发出的通知条数。
   */
  async scanDeadlines(now = Date.now()): Promise<number> {
    const rows = await this.deps.cases.selectRunningWithDeadline(DEADLINE_SCAN_LIMIT);
    let sent = 0;
    for (const caseRow of rows) {
      const ext = readCaseExt(caseRow.ext);
      const deadline = ext.deadline;
      if (typeof deadline !== 'number') continue;
      let kind: 'reminder' | 'overdue' | null = null;
      if (now >= deadline && !ext.deadlineOverdueAt) kind = 'overdue';
      else if (
        now < deadline &&
        deadline - now <= DEADLINE_REMINDER_AHEAD_MS &&
        !ext.deadlineReminderAt
      ) {
        kind = 'reminder';
      }
      if (kind === null) continue;
      try {
        const recipients = await this.deadlineRecipients(caseRow);
        const when = formatDeadline(deadline, this.deps.timeZone);
        const title =
          kind === 'overdue'
            ? `「${caseRow.name}」已于 ${when} 截止，仍有任务未完成`
            : `「${caseRow.name}」将于 ${when} 截止`;
        await this.deps.db.transaction().execute(async (trx) => {
          await this.deps.notifications.notify(
            trx,
            recipients.map((username) => ({
              username,
              type: NotificationType.CASE_DEADLINE,
              title,
              content: kind === 'overdue' ? '请尽快处理或调整截止时间' : '请关注剩余任务进度',
              refType: NotificationRefType.CASE,
              refId: caseRow.id,
            })),
          );
          await this.deps.cases
            .withDb(trx)
            .updateExt(
              caseRow.id,
              kind === 'overdue' ? { deadlineOverdueAt: now } : { deadlineReminderAt: now },
              'SYSTEM',
              now,
            );
        });
        sent += recipients.length;
      } catch (err) {
        this.deps.logger.error({ err, caseId: caseRow.id }, 'deadline notify failed');
      }
    }
    return sent;
  }

  // ---- 内部 ----

  private async deadlineRecipients(caseRow: CaseRow): Promise<string[]> {
    const names = new Set<string>();
    if (hasText(caseRow.creator)) names.add(caseRow.creator.toLowerCase());
    const workspace = await this.deps.workspaces.selectBySpaceCode(caseRow.spaceCode);
    if (workspace) {
      const ships = await this.deps.memberships.selectByWorkspaceId(workspace.id);
      const adminIds = ships.filter((s) => s.roleInSpace === 3).map((s) => s.userId);
      const users = await this.deps.users.selectByIds([...new Set(adminIds)]);
      for (const u of users) names.add(u.username.toLowerCase());
    }
    return [...names];
  }

  private async buildStageProgress(caseRow: CaseRow): Promise<StageProgress[]> {
    const plan = readTaskPlan(caseRow.taskPlanConfig);
    if (!plan || plan.stages.length === 0) return [];
    const rows = await this.deps.tasks.aggregateProgress(caseRow.id);
    return plan.stages.map((item) => {
      let poolPending = 0;
      let personalDoing = 0;
      let done = 0;
      for (const row of rows) {
        if (row.taskType !== item.stage) continue;
        const personal = row.groupType === TaskGroupType.PERSONAL;
        if (row.status === TaskStatus.DONE) done += row.cnt;
        else if (!personal && POOL_PENDING_STATUSES.includes(row.status)) poolPending += row.cnt;
        else if (personal && PERSONAL_DOING_STATUSES.includes(row.status)) personalDoing += row.cnt;
      }
      return { stageType: item.type, taskType: item.stage, poolPending, personalDoing, done };
    });
  }

  /** ext 透传；DONE 的 lastExport 补现签的 downloadUrl（签名失败不影响详情）。 */
  private async buildExt(caseRow: CaseRow): Promise<unknown> {
    const ext = readCaseExt(caseRow.ext);
    if (!ext.lastExport) return caseRow.ext ?? null;
    const last = ext.lastExport;
    if (last.status === CaseExportStatus.DONE && last.objectKey) {
      try {
        last.downloadUrl = await this.deps.storage.presignGet(
          last.objectKey,
          DOWNLOAD_URL_EXPIRES_SECONDS,
        );
      } catch (err) {
        this.deps.logger.warn({ err, caseId: caseRow.id }, 'presign export download url failed');
      }
    }
    return { ...(caseRow.ext as object), lastExport: last };
  }

  private async requireActiveCase(caseId: Maybe<number>): Promise<CaseRow> {
    const row = typeof caseId === 'number' ? await this.deps.cases.selectById(caseId) : undefined;
    if (!row || row.deleted !== DELETED_NO) throw ServiceError.of(CaseErrorCode.CASE_NOT_FOUND);
    return row;
  }

  private async requireWorkspace(spaceCode: Maybe<string>) {
    const workspace = hasText(spaceCode)
      ? await this.deps.workspaces.selectBySpaceCode(spaceCode)
      : undefined;
    if (!workspace) throw ServiceError.of(WorkspaceErrorCode.WORKSPACE_NOT_FOUND);
    return workspace;
  }

  /** 系统管理员 或 该空间 LABEL_ADMIN。 */
  private async requireManageableWorkspace(operatorId: number, spaceCode: Maybe<string>) {
    const workspace = await this.requireWorkspace(spaceCode);
    await this.deps.permissions.checkCanManageWorkspace(workspace.id, operatorId);
    return workspace;
  }

  /** 系统管理员 或 该空间任意角色成员。 */
  private async requireViewableWorkspace(operatorId: number, spaceCode: Maybe<string>) {
    const workspace = await this.requireWorkspace(spaceCode);
    if (await this.deps.permissions.isSystemAdmin(operatorId)) return workspace;
    const memberships = await this.deps.memberships.selectByUserId(operatorId);
    if (!memberships.some((m) => m.workspaceId === workspace.id)) {
      throw ServiceError.of(UserErrorCode.PERMISSION_DENIED);
    }
    return workspace;
  }

  private async validateDatasetVersion(
    versionId: Maybe<number>,
    spaceCode: string,
    labelTool: string,
  ): Promise<number> {
    if (typeof versionId !== 'number')
      throw ServiceError.of(CaseErrorCode.DATASET_VERSION_REQUIRED);
    const version = await this.deps.versions.selectById(versionId);
    if (!version || version.deleted !== DELETED_NO) {
      throw ServiceError.of(CaseErrorCode.DATASET_VERSION_NOT_FOUND);
    }
    const dataset = await this.deps.db
      .selectFrom('markflow_dataset')
      .selectAll()
      .where('id', '=', version.datasetId)
      .where('deleted', '=', DELETED_NO)
      .where('spaceCode', '=', spaceCode)
      .executeTakeFirst();
    if (!dataset) throw ServiceError.of(CaseErrorCode.DATASET_VERSION_NOT_FOUND);
    if (
      dataset.datasetType !== DatasetType.ANNOTATION ||
      dataset.serviceObjName?.toLowerCase() !== labelTool.toLowerCase()
    ) {
      throw ServiceError.of(CaseErrorCode.DATASET_TOOL_MISMATCH);
    }
    if (version.uploadStatus !== UploadStatus.READY) {
      throw ServiceError.of(CaseErrorCode.DATASET_VERSION_NOT_READY);
    }
    return versionId;
  }

  private async validateAssignment(
    assignment: AssignmentConfig,
    stages: StageDef[],
    labelTool: string,
    workspaceId: number,
  ): Promise<void> {
    let memberRoles: Map<string, Set<number>> | null = null;
    for (const stage of stages) {
      if (stage.ai) {
        const ai = stage.type === 'aiPreLabel' ? assignment.aiPreLabel : assignment.aiPreReview;
        if (!ai)
          throw ServiceError.of(CaseErrorCode.STAGE_CONFIG_MISSING, `缺少 ${stage.type} 配置`);
        await this.validateAiStage(ai, labelTool);
      } else {
        const human =
          stage.type === 'label'
            ? assignment.label
            : stage.type === 'review'
              ? assignment.review
              : assignment.recheck;
        if (!human) {
          throw ServiceError.of(CaseErrorCode.STAGE_CONFIG_MISSING, `缺少 ${stage.type} 配置`);
        }
        if (memberRoles === null) memberRoles = await this.loadMemberRoles(workspaceId);
        validateHumanStage(human, stage, memberRoles);
      }
    }
  }

  private async validateAiStage(ai: AiStageConfig, labelTool: string): Promise<void> {
    if (isBlank(ai.aiCode)) throw ServiceError.of(CaseErrorCode.AI_CODE_REQUIRED);
    validatePreDispatchSize(ai.preDispatchSize);
    const config = await this.deps.aiConfigs.getAiConfigByCode(ai.aiCode as string);
    if (!config) throw ServiceError.of(AiConfigErrorCode.AI_CONFIG_NOT_FOUND);
    if (config.labelToolCode.toLowerCase() !== labelTool.toLowerCase()) {
      throw ServiceError.of(CaseErrorCode.AI_CONFIG_LABEL_TOOL_MISMATCH);
    }
  }

  /** 空间成员 username（小写）→ 角色集合。 */
  private async loadMemberRoles(workspaceId: number): Promise<Map<string, Set<number>>> {
    const ships = await this.deps.memberships.selectByWorkspaceId(workspaceId);
    const out = new Map<string, Set<number>>();
    if (ships.length === 0) return out;
    const users = await this.deps.users.selectByIds([...new Set(ships.map((s) => s.userId))]);
    const nameById = new Map(users.map((u) => [u.id, u.username.toLowerCase()]));
    for (const ship of ships) {
      const name = nameById.get(ship.userId);
      if (name === undefined) continue;
      let roles = out.get(name);
      if (!roles) out.set(name, (roles = new Set()));
      roles.add(ship.roleInSpace);
    }
    return out;
  }
}

/** 截止时间：缺省 / null → null；否则须为毫秒整数且晚于当前时间。 */
function validateDeadline(raw: Maybe<number>): number | null {
  if (raw === null || raw === undefined) return null;
  if (!Number.isSafeInteger(raw) || raw <= Date.now()) {
    throw ServiceError.of(CaseErrorCode.DEADLINE_INVALID, '截止时间需晚于当前时间');
  }
  return raw;
}

function formatDeadline(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
  return parts.replace(/\//g, '-');
}

function validateBasic(input: CreateCaseInput): string {
  const name = input.name;
  if (typeof name !== 'string' || name.trim() === '' || name.length > CASE_NAME_MAX_LENGTH) {
    throw ServiceError.of(CaseErrorCode.CASE_NAME_INVALID);
  }
  if (typeof input.description === 'string' && input.description.length > DESCRIPTION_MAX_LENGTH) {
    throw ServiceError.of(CaseErrorCode.DESCRIPTION_TOO_LONG);
  }
  if (isBlank(input.labelTool)) throw ServiceError.of(CaseErrorCode.LABEL_TOOL_REQUIRED);
  return name;
}

/** 边界：stages 必须存在；type 必须合法；stage 编号按 type 重写。 */
function buildTaskPlan(raw: CreateCaseInput['taskPlanConfig']): TaskPlanConfig {
  if (!raw || !Array.isArray(raw.stages)) {
    throw ServiceError.of(CaseErrorCode.TASK_PLAN_INVALID, 'taskPlanConfig.stages 不能为空');
  }
  const stages = raw.stages.map((item) => {
    const def = stageByType(item?.type);
    if (!def) throw ServiceError.of(CaseErrorCode.STAGE_TYPE_INVALID);
    return { stage: def.code, type: def.type };
  });
  return { stages };
}

function buildAssignment(raw: CreateCaseInput['assignmentConfig']): AssignmentConfig {
  if (!raw) throw ServiceError.of(CaseErrorCode.STAGE_CONFIG_MISSING, 'assignmentConfig 不能为空');
  return {
    aiPreLabel: toAiStage(raw.aiPreLabel),
    label: toHumanStage(raw.label),
    aiPreReview: toAiStage(raw.aiPreReview),
    review: toHumanStage(raw.review),
    recheck: toHumanStage(raw.recheck),
  };
}

function toAiStage(raw: Maybe<AiStageInput>): AiStageConfig | null {
  if (!raw) return null;
  return {
    aiCode: raw.aiCode ?? null,
    preDispatchSize: raw.preDispatchSize ?? null,
    autoRecycleMinutes: raw.autoRecycleMinutes ?? null,
  };
}

function toHumanStage(raw: Maybe<HumanStageInput>): HumanStageConfig | null {
  if (!raw) return null;
  const strategy = raw.strategy ?? null;
  if (strategy !== null && !isStrategyCode(strategy)) {
    throw ServiceError.of(CaseErrorCode.STRATEGY_INVALID);
  }
  const members: MemberConfig[] | null = Array.isArray(raw.members)
    ? raw.members.map((m) => ({
        username: m?.username ?? null,
        ratio: m?.ratio ?? null,
        active: m?.active ?? null,
      }))
    : null;
  return {
    strategy,
    preDispatchSize: raw.preDispatchSize ?? null,
    autoRecycleMinutes: raw.autoRecycleMinutes ?? null,
    members,
  };
}

/** stages 非空、type 不重复、code 严格递增、至少含 aiPreLabel 或 label；返回阶段定义列表。 */
function validateTaskPlan(plan: TaskPlanConfig): StageDef[] {
  if (plan.stages.length === 0) {
    throw ServiceError.of(CaseErrorCode.TASK_PLAN_INVALID, 'stages 不能为空');
  }
  const defs = plan.stages.map((s) => stageByType(s.type) as StageDef);
  if (new Set(defs.map((d) => d.type)).size !== defs.length) {
    throw ServiceError.of(CaseErrorCode.TASK_PLAN_INVALID, 'stage 类型不可重复');
  }
  for (let i = 1; i < defs.length; i += 1) {
    if ((defs[i] as StageDef).code <= (defs[i - 1] as StageDef).code) {
      throw ServiceError.of(
        CaseErrorCode.TASK_PLAN_INVALID,
        'stage 顺序必须为 aiPreLabel→label→aiPreReview→review→recheck',
      );
    }
  }
  if (!defs.some((d) => d.type === 'aiPreLabel' || d.type === 'label')) {
    throw ServiceError.of(CaseErrorCode.TASK_PLAN_INVALID, '至少包含 aiPreLabel 或 label');
  }
  return defs;
}

function validatePreDispatchSize(size: number | null): void {
  if (size !== null && size < 1) throw ServiceError.of(CaseErrorCode.PRE_DISPATCH_SIZE_INVALID);
}

function validateHumanStage(
  human: HumanStageConfig,
  stage: StageDef,
  memberRoles: Map<string, Set<number>>,
): void {
  const strategy = human.strategy;
  if (strategy === null) throw ServiceError.of(CaseErrorCode.STRATEGY_INVALID);
  validatePreDispatchSize(human.preDispatchSize);
  const members = human.members;
  if (!members || members.length === 0) throw ServiceError.of(CaseErrorCode.STAGE_MEMBERS_REQUIRED);
  const requiredRole = stage.requiredRole as number;
  let activeRatioSum = 0;
  let hasActive = false;
  for (const member of members) {
    const username = member.username;
    if (isBlank(username)) {
      throw ServiceError.of(CaseErrorCode.MEMBER_NOT_IN_WORKSPACE, '成员 username 不能为空');
    }
    const roles = memberRoles.get((username as string).toLowerCase());
    if (!roles)
      throw ServiceError.of(CaseErrorCode.MEMBER_NOT_IN_WORKSPACE, `${username} 不在该空间`);
    if (!roles.has(requiredRole)) {
      throw ServiceError.of(
        CaseErrorCode.MEMBER_ROLE_MISMATCH,
        `${username} 在该空间缺少角色 ${requiredRole === 1 ? 'LABELER' : 'REVIEWER'}`,
      );
    }
    if (strategy === Strategy.FCFS) {
      if (member.ratio !== null) {
        throw ServiceError.of(CaseErrorCode.RATIO_INVALID, 'FCFS 下 ratio 必须为 null');
      }
    } else if (isMemberActive(member)) {
      hasActive = true;
      const ratio = member.ratio;
      if (ratio === null || ratio < 0 || ratio > RATIO_TOTAL) {
        throw ServiceError.of(CaseErrorCode.RATIO_INVALID, 'active 成员 ratio 需在 0-100');
      }
      activeRatioSum += ratio;
    }
  }
  if (strategy === Strategy.FIXED_RATIO) {
    if (!hasActive) {
      throw ServiceError.of(CaseErrorCode.STAGE_MEMBERS_REQUIRED, '固定分配至少需一个 active 成员');
    }
    if (activeRatioSum !== RATIO_TOTAL) throw ServiceError.of(CaseErrorCode.RATIO_INVALID);
  }
}
