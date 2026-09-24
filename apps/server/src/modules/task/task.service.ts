// 任务领域服务（对应 Java TaskDomainServiceImpl；规则表 0004 §2 查询、§4 保存 / 提交、§5 审核、§7 自动回收）。
// 与 Java 的差异：task 读写接口校验调用者（annotator / 系统管理员 / 空间 LABEL_ADMIN）；
// 驳回留组时重置 claimTime；驳回 AI 阶段 target 时重新触发 AI；提交类操作在事务内写 outbox、提交后投递并补题。
import type { CaseRow, TaskRow } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import type { RedisLock } from '../../infra/lock.js';
import type { Logger } from '../../infra/logger.js';
import type { OutboxService } from '../../infra/outbox.js';
import { QUEUE_NAMES } from '../../infra/queue.js';
import type { Operator } from '../common/operator.js';
import { emptyPage, normalizePage, type PageInput, type PageResult } from '../common/pagination.js';
import type { PermissionService } from '../common/permission.js';
import { hasText, type Maybe } from '../common/strings.js';
import type { DatasetSampleRepository } from '../dataset/dataset-sample.repo.js';
import type { DatasetVersionRepository } from '../dataset/dataset-version.repo.js';
import { DELETED_NO, type DatasetRepository } from '../dataset/dataset.repo.js';
import { DatasetType, UploadStatus } from '../dataset/enums.js';
import { LabelToolErrorCode } from '../labeltool/error-codes.js';
import type { LabelToolRepository } from '../labeltool/labeltool.repo.js';
import { UserErrorCode } from '../user/error-codes.js';
import type { WorkspaceRepository } from '../workspace/workspace.repo.js';
import {
  NotificationRefType,
  NotificationType,
  type NotificationService,
} from '../notification/notification.service.js';
import type { CaseRepository } from './case.repo.js';
import {
  autoRecycleMinutesOf,
  isExecutorActiveInStage,
  nextStageInPlan,
  planStages,
  prevStageInPlan,
  readAssignment,
  readTaskPlan,
  sameName,
} from './config.js';
import { DispatchEngine, STAGE_DESC, SYSTEM_OPERATOR } from './dispatch-engine.js';
import {
  CaseStatus,
  IN_HAND_STATUSES,
  isAnnotationTaskType,
  isTaskStatusCode,
  ReviewAction,
  requireStageByCode,
  SampleType,
  TaskStatus,
  type ReviewActionCode,
  type SampleTypeCode,
  type StageDef,
} from './enums.js';
import { CaseErrorCode, TaskErrorCode } from './error-codes.js';
import type { TaskGroupRepository } from './task-group.repo.js';
import type { TaskRepository } from './task.repo.js';

const RESULT_VERSION_LOCK = { waitMs: 3_000, leaseMs: 10_000 };
const RESULT_DATASET_NAME_PREFIX = '结果集_case';
const INIT_VERSION_NUMBER = 1;
export const SYSTEM_AUTO_RECYCLE_OPERATOR = 'SYSTEM_AUTO_RECYCLE';
const AUTO_RECYCLE_SCAN_LIMIT = 500;
const ONE_MINUTE_MILLIS = 60_000;

export interface TaskServiceDeps {
  db: Db;
  tasks: TaskRepository;
  groups: TaskGroupRepository;
  cases: CaseRepository;
  samples: DatasetSampleRepository;
  datasets: DatasetRepository;
  versions: DatasetVersionRepository;
  labelTools: LabelToolRepository;
  workspaces: WorkspaceRepository;
  permissions: PermissionService;
  dispatch: DispatchEngine;
  lock: RedisLock;
  outbox: OutboxService;
  notifications: NotificationService;
  logger: Logger;
}

export interface TaskListItem {
  taskId: number;
  taskType: number;
  bizId: string | null;
  taskGroupSeq: number;
  status: number;
  round: number;
  claimTime: number | null;
  createTime: number;
  updateTime: number;
}

export interface TaskDetail {
  taskId: number;
  taskGroupId: number;
  caseId: number;
  taskType: number;
  stageType: string;
  status: number;
  round: number;
  bizId: string | null;
  annotator: string | null;
  claimTime: number | null;
  labelTool: {
    labelToolCode: string;
    labelToolName: string;
    labelToolType: number;
    labelToolUrl: string | null;
    labelToolPageSchema: unknown;
  };
}

export interface TaskResult {
  taskId: number;
  sampleType: number;
  hasResult: boolean;
  result: unknown;
}

/** 提交类操作的事务产物：outbox 行 + 提交后要做的补题动作。 */
interface SubmitOutcome {
  outboxIds: number[];
  after: Array<() => Promise<void>>;
}

export class TaskService {
  constructor(private readonly deps: TaskServiceDeps) {}

  // ---- 查询 ----

  async getTaskListInGroup(
    operator: Operator,
    input: PageInput & { taskGroupId?: Maybe<number>; status?: Maybe<number> },
  ): Promise<PageResult<TaskListItem>> {
    const page = normalizePage(input);
    if (input.status !== null && input.status !== undefined && !isTaskStatusCode(input.status)) {
      throw ServiceError.of(CommonErrorCode.PARAM_INVALID, 'status 不合法');
    }
    const group =
      typeof input.taskGroupId === 'number'
        ? await this.deps.groups.selectById(input.taskGroupId)
        : undefined;
    if (!group) throw ServiceError.of(CommonErrorCode.PARAM_INVALID, '任务组不存在');
    await this.checkCanAccessGroup(operator, group.annotator, group.caseId);
    const total = await this.deps.tasks.countInGroup(group.id, input.status);
    if (total === 0) return emptyPage(page);
    const rows = await this.deps.tasks.selectInGroup(
      group.id,
      input.status,
      page.offset,
      page.pageSize,
    );
    return {
      list: rows.map((t) => ({
        taskId: t.id,
        taskType: t.taskType,
        bizId: t.bizId,
        taskGroupSeq: t.taskGroupSeq,
        status: t.status,
        round: t.round,
        claimTime: t.claimTime,
        createTime: t.createTime,
        updateTime: t.updateTime,
      })),
      total,
      pageNum: page.pageNum,
      pageSize: page.pageSize,
    };
  }

  async getTaskDetail(operator: Operator, input: { taskId?: Maybe<number> }): Promise<TaskDetail> {
    const task = await this.requireTask(input.taskId);
    await this.checkCanAccessTask(operator, task);
    const caseRow = await this.deps.cases.selectById(task.caseId);
    const tool = caseRow
      ? await this.deps.labelTools.selectByCode(caseRow.labelToolCode)
      : undefined;
    if (!tool) throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_NOT_FOUND);
    return {
      taskId: task.id,
      taskGroupId: task.taskGroupId,
      caseId: task.caseId,
      taskType: task.taskType,
      stageType: requireStageByCode(task.taskType).type,
      status: task.status,
      round: task.round,
      bizId: task.bizId,
      annotator: task.annotator,
      claimTime: task.claimTime,
      labelTool: {
        labelToolCode: tool.labelToolCode,
        labelToolName: tool.labelToolName,
        labelToolType: tool.labelToolType,
        labelToolUrl: tool.labelToolUrl,
        labelToolPageSchema: tool.labelToolPageSchema,
      },
    };
  }

  async getSampleData(
    operator: Operator,
    input: { taskId?: Maybe<number> },
  ): Promise<{ taskId: number; bizId: string | null; sampleData: unknown }> {
    const task = await this.requireTask(input.taskId);
    await this.checkCanAccessTask(operator, task);
    const sample = await this.deps.samples.selectById(task.dataSampleId);
    if (!sample) throw ServiceError.of(TaskErrorCode.SAMPLE_NOT_FOUND);
    return { taskId: task.id, bizId: sample.bizId, sampleData: sample.sampleDataJson };
  }

  async getTaskResult(
    operator: Operator,
    input: { taskId?: Maybe<number>; sampleType: SampleTypeCode },
  ): Promise<TaskResult> {
    const task = await this.requireTask(input.taskId);
    await this.checkCanAccessTask(operator, task);
    const caseRow = await this.deps.cases.selectById(task.caseId);
    const empty: TaskResult = {
      taskId: task.id,
      sampleType: input.sampleType,
      hasResult: false,
      result: null,
    };
    const versionId = caseRow?.labelResultDatasetVersionId ?? null;
    if (versionId === null) return empty;
    const bizId = await this.resolveResultBizId(task, input.sampleType, versionId);
    if (bizId === null) return empty;
    const target = await this.deps.samples.selectByVersionAndBizId(versionId, bizId);
    if (!target) return empty;
    return { ...empty, hasResult: true, result: target.sampleDataJson };
  }

  // ---- 保存 / 提交 ----

  /** 接口入口：调用者必须是 annotator。 */
  async saveTaskResult(
    operator: Operator,
    input: { taskId?: Maybe<number>; sampleType: SampleTypeCode; result: unknown },
  ): Promise<void> {
    const task = await this.requireTask(input.taskId);
    this.checkIsAnnotator(operator.username, task);
    await this.saveTaskResultInternal(task, input.sampleType, input.result);
  }

  /** 内部入口（AI 执行器）：不校验调用者。 */
  async saveTaskResultInternal(
    task: TaskRow,
    sampleType: SampleTypeCode,
    result: unknown,
  ): Promise<void> {
    const caseRow = await this.requireWritableCase(task.caseId);
    // lazy 结果版本使用独立事务，必须在持有 task 行锁/连接之前创建，避免并发首存耗尽连接池。
    if (task.status === TaskStatus.DONE)
      throw ServiceError.of(TaskErrorCode.TASK_ALREADY_COMPLETED);
    if (sampleType === SampleType.ANNOTATION && caseRow.labelResultDatasetVersionId === null) {
      caseRow.labelResultDatasetVersionId = await this.getOrCreateResultVersion(
        caseRow,
        operatorOf(task),
      );
    }
    await this.deps.db.transaction().execute(async (trx) => {
      await this.lockWritableTask(trx, task);
      await this.writeResultSample(trx, task, caseRow, sampleType, result);
    });
  }

  async submitLabelTask(operator: Operator, input: { taskId?: Maybe<number> }): Promise<void> {
    const task = await this.requireTask(input.taskId);
    this.checkIsAnnotator(operator.username, task);
    await this.submitLabelTaskInternal(task);
  }

  async submitLabelTaskInternal(task: TaskRow): Promise<void> {
    if (!isAnnotationTaskType(task.taskType))
      throw ServiceError.of(TaskErrorCode.TASK_TYPE_INVALID);
    if (task.status === TaskStatus.DONE)
      throw ServiceError.of(TaskErrorCode.TASK_ALREADY_COMPLETED);
    const caseRow = await this.requireWritableCase(task.caseId);
    const versionId = caseRow.labelResultDatasetVersionId;
    const labelResult =
      versionId === null
        ? undefined
        : await this.deps.samples.selectByVersionAndBizId(versionId, String(task.dataSampleId));
    if (!labelResult) throw ServiceError.of(TaskErrorCode.RESULT_SAMPLE_NOT_FOUND);
    const currentStage = requireStageByCode(task.taskType);
    const nextStage = nextStageInPlan(readTaskPlan(caseRow.taskPlanConfig), currentStage);

    const outcome = await this.deps.db.transaction().execute(async (trx) => {
      const now = Date.now();
      await this.completeTaskOrThrow(trx, task, now);
      const outboxId = await this.enqueueTaskCompleted(trx, task, currentStage, nextStage, now);
      return {
        outboxIds: [outboxId],
        after: [
          () => this.refillQuietly(task, currentStage),
          () => this.finishCaseIfDoneQuietly(caseRow, nextStage),
        ],
      } satisfies SubmitOutcome;
    });
    await this.finish(outcome);
  }

  async submitReviewTask(
    operator: Operator,
    input: {
      taskId?: Maybe<number>;
      reviewAction: ReviewActionCode;
      reviewComment?: Maybe<string>;
    },
  ): Promise<void> {
    const task = await this.requireTask(input.taskId);
    this.checkIsAnnotator(operator.username, task);
    await this.submitReviewTaskInternal(task, input.reviewAction, input.reviewComment ?? null);
  }

  async submitReviewTaskInternal(
    task: TaskRow,
    reviewAction: ReviewActionCode,
    reviewComment: string | null,
  ): Promise<void> {
    if (isAnnotationTaskType(task.taskType)) throw ServiceError.of(TaskErrorCode.TASK_TYPE_INVALID);
    if (task.status === TaskStatus.DONE)
      throw ServiceError.of(TaskErrorCode.TASK_ALREADY_COMPLETED);
    const caseRow = await this.requireWritableCase(task.caseId);
    const plan = readTaskPlan(caseRow.taskPlanConfig);
    const currentStage = requireStageByCode(task.taskType);
    const review = { reviewAction, reviewComment };

    if (reviewAction === ReviewAction.PASS) {
      const nextStage = nextStageInPlan(plan, currentStage);
      const outcome = await this.deps.db.transaction().execute(async (trx) => {
        await this.lockWritableTask(trx, task);
        await this.writeResultSample(trx, task, caseRow, SampleType.REVIEW, review);
        const now = Date.now();
        await this.completeTaskOrThrow(trx, task, now);
        const outboxId = await this.enqueueTaskCompleted(trx, task, currentStage, nextStage, now);
        return {
          outboxIds: [outboxId],
          after: [
            () => this.refillQuietly(task, currentStage),
            () => this.finishCaseIfDoneQuietly(caseRow, nextStage),
          ],
        } satisfies SubmitOutcome;
      });
      await this.finish(outcome);
      return;
    }

    const prevStage = prevStageInPlan(plan, currentStage);
    if (!prevStage) throw ServiceError.of(TaskErrorCode.PREVIOUS_STAGE_NOT_FOUND);
    const target = await this.deps.tasks.selectByCaseTypeAndSample(
      task.caseId,
      prevStage.code,
      task.dataSampleId,
    );
    if (!target) throw ServiceError.of(TaskErrorCode.REJECT_TARGET_NOT_FOUND);
    const assignment = readAssignment(caseRow.assignmentConfig);
    const originActive = isExecutorActiveInStage(assignment, prevStage, target.annotator);

    const outcome = await this.deps.db.transaction().execute(async (trx) => {
      const tasks = this.deps.tasks.withDb(trx);
      await this.lockWritableTask(trx, task);
      await this.writeResultSample(trx, task, caseRow, SampleType.REVIEW, review);
      const now = Date.now();
      await this.completeTaskOrThrow(trx, task, now);
      const operator = operatorOf(task);
      const outboxIds: number[] = [];
      const after: Array<() => Promise<void>> = [];
      const groups = this.deps.groups.withDb(trx);
      if (originActive) {
        await tasks.rejectKeepInGroup(target.id, operator, now);
        await groups.refreshPersonalGroupStats([target.taskGroupId], now);
        if (!prevStage.ai && target.annotator !== null) {
          // 站内通知（M5）：驳回给原标注 / 审核人，任务留在其个人组。
          await this.deps.notifications.notify(trx, [
            {
              username: target.annotator,
              type: NotificationType.TASK_REJECTED,
              title: `「${caseRow.name}」有 1 条${STAGE_DESC[prevStage.type] ?? prevStage.type}任务被打回`,
              content: rejectContent(target, reviewComment),
              refType: NotificationRefType.TASK_GROUP,
              refId: target.taskGroupId,
            },
          ]);
        }
        if (prevStage.ai && target.annotator !== null) {
          // 规则表 5.6：AI 阶段的 target 留在 AI 个人组时重新触发 AI 执行。
          outboxIds.push(
            await this.deps.outbox.enqueueTx(trx, {
              queue: QUEUE_NAMES.taskDispatched,
              jobName: 'dispatched',
              payload: {
                caseId: task.caseId,
                taskId: target.id,
                taskType: prevStage.code,
                annotator: target.annotator,
                dataSampleId: target.dataSampleId,
                dispatchTime: now,
              },
            }),
          );
        }
      } else {
        const prevPool = await groups.selectPoolByCaseAndType(task.caseId, prevStage.poolType);
        if (!prevPool) throw ServiceError.of(CaseErrorCode.POOL_NOT_FOUND);
        const seq = (await tasks.maxSeqInGroup(prevPool.id)) + 1;
        await tasks.rejectToPool(target.id, prevPool.id, seq, operator, now);
        await groups.refreshPersonalGroupStats([target.taskGroupId], now);
        after.push(() => this.deps.dispatch.dispatchPoolQuietly(task.caseId, prevStage.poolType));
      }
      after.push(() => this.refillQuietly(task, currentStage));
      return { outboxIds, after } satisfies SubmitOutcome;
    });
    await this.finish(outcome);
  }

  // ---- 自动回收（规则表 §7） ----

  async autoRecycleOverdueTasks(): Promise<number> {
    const candidates = await this.deps.tasks.selectAutoRecycleCandidates(AUTO_RECYCLE_SCAN_LIMIT);
    if (candidates.length === 0) return 0;
    const now = Date.now();
    const caseCache = new Map<number, CaseRow | undefined>();
    const poolCache = new Map<string, { id: number } | undefined>();
    const targets = new Map<number, Set<number>>();
    let recycled = 0;
    for (const task of candidates) {
      try {
        let caseRow = caseCache.get(task.caseId);
        if (!caseCache.has(task.caseId)) {
          caseRow = await this.deps.cases.selectById(task.caseId);
          caseCache.set(task.caseId, caseRow);
        }
        if (!caseRow) continue;
        const assignment = readAssignment(caseRow.assignmentConfig);
        if (!assignment) continue;
        const stage = requireStageByCode(task.taskType);
        const minutes = autoRecycleMinutesOf(assignment, stage);
        if (minutes === null || task.claimTime === null) continue;
        if (now - task.claimTime < minutes * ONE_MINUTE_MILLIS) continue;
        const poolKey = `${task.caseId}:${stage.poolType}`;
        let pool = poolCache.get(poolKey);
        if (!poolCache.has(poolKey)) {
          pool = await this.deps.groups.selectPoolByCaseAndType(task.caseId, stage.poolType);
          poolCache.set(poolKey, pool);
        }
        if (!pool) {
          this.deps.logger.warn(
            { taskId: task.id, caseId: task.caseId, poolType: stage.poolType },
            'auto-recycle skipped: pool missing',
          );
          continue;
        }
        const seq = (await this.deps.tasks.maxSeqInGroup(pool.id)) + 1;
        const affected = await this.deps.tasks.recycleToPool(
          task.id,
          pool.id,
          task.taskGroupId,
          seq,
          SYSTEM_AUTO_RECYCLE_OPERATOR,
          now,
        );
        if (affected === 0) continue;
        await this.deps.groups.refreshPersonalGroupStats([task.taskGroupId], now);
        recycled += 1;
        this.deps.logger.info(
          {
            taskId: task.id,
            caseId: task.caseId,
            annotator: task.annotator,
            overdueMs: now - task.claimTime,
            fromStatus: task.status,
          },
          'auto-recycled task',
        );
        let set = targets.get(task.caseId);
        if (!set) targets.set(task.caseId, (set = new Set()));
        set.add(stage.poolType);
      } catch (err) {
        this.deps.logger.error({ err, taskId: task.id }, 'auto-recycle single task failed');
      }
    }
    for (const [caseId, poolTypes] of targets) {
      for (const poolType of poolTypes)
        await this.deps.dispatch.dispatchPoolQuietly(caseId, poolType);
    }
    return recycled;
  }

  // ---- 内部 ----

  private async requireTask(taskId: Maybe<number>): Promise<TaskRow> {
    const task = typeof taskId === 'number' ? await this.deps.tasks.selectById(taskId) : undefined;
    if (!task) throw ServiceError.of(TaskErrorCode.TASK_NOT_FOUND);
    return task;
  }

  private checkIsAnnotator(username: string, task: TaskRow): void {
    if (task.annotator === null || !sameName(task.annotator, username)) {
      throw ServiceError.of(UserErrorCode.PERMISSION_DENIED);
    }
  }

  /** 读权限：annotator 本人 / 系统管理员 / case 空间 LABEL_ADMIN。 */
  private async checkCanAccessTask(operator: Operator, task: TaskRow): Promise<void> {
    await this.checkCanAccessGroup(operator, task.annotator, task.caseId);
  }

  private async checkCanAccessGroup(
    operator: Operator,
    annotator: string | null,
    caseId: number,
  ): Promise<void> {
    if (annotator !== null && sameName(annotator, operator.username)) return;
    if (await this.deps.permissions.isSystemAdmin(operator.userId)) return;
    const caseRow = await this.deps.cases.selectById(caseId);
    const workspace = caseRow
      ? await this.deps.workspaces.selectBySpaceCode(caseRow.spaceCode)
      : undefined;
    if (workspace && (await this.deps.permissions.isLabelAdmin(workspace.id, operator.userId))) {
      return;
    }
    throw ServiceError.of(UserErrorCode.PERMISSION_DENIED);
  }

  /** 标注结果 bizId = String(dataSampleId)；质检结果 bizId = String(标注结果 sample.id)，标注结果缺失返回 null。 */
  private async resolveResultBizId(
    task: TaskRow,
    sampleType: SampleTypeCode,
    versionId: number,
  ): Promise<string | null> {
    const sampleIdStr = String(task.dataSampleId);
    if (sampleType === SampleType.ANNOTATION) return sampleIdStr;
    const labelResult = await this.deps.samples.selectByVersionAndBizId(versionId, sampleIdStr);
    return labelResult ? String(labelResult.id) : null;
  }

  /** 写结果 sample（透传不校验），覆盖式。 */
  private async writeResultSample(
    db: Db,
    task: TaskRow,
    caseRow: CaseRow,
    sampleType: SampleTypeCode,
    result: unknown,
  ): Promise<void> {
    const samples = this.deps.samples.withDb(db);
    const operator = operatorOf(task);
    let versionId = caseRow.labelResultDatasetVersionId;
    let bizId: string;
    if (sampleType === SampleType.ANNOTATION) {
      if (versionId === null) versionId = await this.getOrCreateResultVersion(caseRow, operator);
      bizId = String(task.dataSampleId);
    } else {
      if (versionId === null) throw ServiceError.of(TaskErrorCode.LABEL_RESULT_NOT_FOUND);
      const labelResult = await samples.selectByVersionAndBizId(
        versionId,
        String(task.dataSampleId),
      );
      if (!labelResult) throw ServiceError.of(TaskErrorCode.LABEL_RESULT_NOT_FOUND);
      bizId = String(labelResult.id);
    }
    const now = Date.now();
    const existing = await samples.selectByVersionAndBizId(versionId, bizId);
    if (existing) {
      await samples.updateSampleDataJson(existing.id, result, operator, now);
    } else {
      await samples.insert({
        datasetVersionId: versionId,
        bizId,
        sampleDataJson: JSON.stringify(result ?? null),
        deleted: DELETED_NO,
        ext: null,
        creator: operator,
        operator,
        createTime: now,
        updateTime: now,
      });
    }
  }

  /** lazy 创建结果集版本：锁内 double-check → 事务建 dataset(RESULT) + version(READY) + 回写 case。用主库连接（不在调用方事务内，避免锁内长事务）。 */
  private async getOrCreateResultVersion(caseRow: CaseRow, operator: string): Promise<number> {
    return this.deps.lock.withLock(
      `dataset_version:case:${caseRow.id}:label_result`,
      CaseErrorCode.OPERATION_CONFLICT,
      async () => {
        const fresh = await this.deps.cases.selectById(caseRow.id);
        if (fresh?.labelResultDatasetVersionId) return fresh.labelResultDatasetVersionId;
        return this.deps.db.transaction().execute(async (trx) => {
          const now = Date.now();
          const datasetId = await this.deps.datasets.withDb(trx).insert({
            spaceCode: caseRow.spaceCode,
            datasetName: `${RESULT_DATASET_NAME_PREFIX}${caseRow.id}`,
            datasetDesc: null,
            datasetType: DatasetType.RESULT,
            serviceObjName: caseRow.labelToolCode,
            latestVersionNumber: INIT_VERSION_NUMBER,
            deleted: DELETED_NO,
            ext: null,
            creator: operator,
            operator,
            createTime: now,
            updateTime: now,
          });
          const versionId = await this.deps.versions.withDb(trx).insert({
            datasetId,
            versionNumber: INIT_VERSION_NUMBER,
            versionDesc: null,
            ossPath: null,
            uploadStatus: UploadStatus.READY,
            sampleCount: 0,
            deleted: DELETED_NO,
            ext: null,
            creator: operator,
            operator,
            createTime: now,
            updateTime: now,
          });
          await this.deps.cases
            .withDb(trx)
            .updateLabelResultDatasetVersionId(caseRow.id, versionId, operator, now);
          return versionId;
        });
      },
      RESULT_VERSION_LOCK,
    );
  }

  private async completeTaskOrThrow(trx: Db, task: TaskRow, now: number): Promise<void> {
    await this.lockWritableTask(trx, task);
    const costTime = task.claimTime === null ? null : now - task.claimTime;
    const affected = await this.deps.tasks
      .withDb(trx)
      .updateToCompleted(task.id, costTime, operatorOf(task), now);
    if (affected === 0) throw ServiceError.of(TaskErrorCode.TASK_ALREADY_COMPLETED);
    await this.deps.groups.withDb(trx).refreshPersonalGroupStats([task.taskGroupId], now);
  }

  /** 行锁与提交、回收的 UPDATE 互斥；旧请求不能写入新轮次或新持有人的结果。 */
  private async lockWritableTask(trx: Db, expected: TaskRow): Promise<void> {
    const current = await trx
      .selectFrom('label_task')
      .selectAll()
      .where('id', '=', expected.id)
      .forUpdate()
      .executeTakeFirst();
    if (!current) throw ServiceError.of(TaskErrorCode.TASK_NOT_FOUND);
    if (current.status === TaskStatus.DONE)
      throw ServiceError.of(TaskErrorCode.TASK_ALREADY_COMPLETED);
    if (
      !IN_HAND_STATUSES.includes(current.status) ||
      current.annotator === null ||
      current.annotator !== expected.annotator ||
      current.round !== expected.round ||
      current.taskGroupId !== expected.taskGroupId ||
      current.claimTime !== expected.claimTime
    )
      throw ServiceError.of(TaskErrorCode.TASK_STATE_CHANGED);
  }

  /** case 存在且未结束；已结束的 case 拒绝保存 / 提交（CASE_FINISHED）。 */
  private async requireWritableCase(caseId: number): Promise<CaseRow> {
    const caseRow = await this.deps.cases.selectById(caseId);
    if (!caseRow) throw ServiceError.of(CaseErrorCode.CASE_NOT_FOUND);
    if (caseRow.status === CaseStatus.FINISHED) throw ServiceError.of(CaseErrorCode.CASE_FINISHED);
    return caseRow;
  }

  /**
   * case 状态机（规则表 0004 §10 · 9.8，M5 补）：末阶段任务完成后检查——
   * 末阶段 DONE 数 = 首阶段任务数（即每个样本都走完了）且全 case 无未完成 task → RUNNING → FINISHED。
   * 中间阶段完成时下一阶段 task 尚未入池，不会误判；驳回与完成同事务，也不会误判。
   */
  async finishCaseIfDone(caseId: number): Promise<boolean> {
    const caseRow = await this.deps.cases.selectById(caseId);
    if (!caseRow || caseRow.status !== CaseStatus.RUNNING) return false;
    const stages = planStages(readTaskPlan(caseRow.taskPlanConfig));
    const first = stages[0];
    const last = stages[stages.length - 1];
    if (!first || !last) return false;
    const rows = await this.deps.tasks.aggregateProgress(caseId);
    let firstTotal = 0;
    let lastDone = 0;
    let notDone = 0;
    for (const r of rows) {
      if (r.taskType === first.code) firstTotal += r.cnt;
      if (r.taskType === last.code && r.status === TaskStatus.DONE) lastDone += r.cnt;
      if (r.status !== TaskStatus.DONE) notDone += r.cnt;
    }
    if (firstTotal === 0 || lastDone < firstTotal || notDone > 0) return false;
    const now = Date.now();
    const affected = await this.deps.db.transaction().execute(async (trx) => {
      const n = await this.deps.cases
        .withDb(trx)
        .updateStatus(caseId, [CaseStatus.RUNNING], CaseStatus.FINISHED, SYSTEM_OPERATOR, now);
      if (n > 0 && hasText(caseRow.creator)) {
        await this.deps.notifications.notify(trx, [
          {
            username: caseRow.creator,
            type: NotificationType.CASE_FINISHED,
            title: `「${caseRow.name}」全部任务已完成，标注任务已自动结束`,
            content: null,
            refType: NotificationRefType.CASE,
            refId: caseId,
          },
        ]);
      }
      return n;
    });
    if (affected > 0) this.deps.logger.info({ caseId }, 'case auto-finished');
    return affected > 0;
  }

  private async finishCaseIfDoneQuietly(caseRow: CaseRow, nextStage: StageDef | null) {
    if (nextStage !== null) return;
    try {
      await this.finishCaseIfDone(caseRow.id);
    } catch (err) {
      this.deps.logger.warn({ err, caseId: caseRow.id }, 'finishCaseIfDone failed (ignored)');
    }
  }

  private enqueueTaskCompleted(
    trx: Db,
    task: TaskRow,
    currentStage: StageDef,
    nextStage: StageDef | null,
    completedTime: number,
  ): Promise<number> {
    return this.deps.outbox.enqueueTx(trx, {
      queue: QUEUE_NAMES.taskCompleted,
      jobName: 'completed',
      payload: {
        caseId: task.caseId,
        taskId: task.id,
        round: task.round,
        dataSampleId: task.dataSampleId,
        currentStageType: currentStage.type,
        nextStageType: nextStage ? nextStage.type : null,
        annotator: task.annotator,
        completedTime,
      },
    });
  }

  private async refillQuietly(task: TaskRow, stage: StageDef): Promise<void> {
    if (!hasText(task.annotator)) return;
    await this.deps.dispatch.dispatchToMemberQuietly(task.caseId, stage.poolType, task.annotator);
  }

  /** 事务提交后：先投递 outbox，再执行补题等 best-effort 动作。 */
  private async finish(outcome: SubmitOutcome): Promise<void> {
    await this.deps.outbox.deliver(outcome.outboxIds);
    for (const action of outcome.after) await action();
  }
}

export function operatorOf(task: Pick<TaskRow, 'annotator'>): string {
  return task.annotator ?? SYSTEM_OPERATOR;
}

const REJECT_COMMENT_MAX = 200;

function rejectContent(target: Pick<TaskRow, 'bizId' | 'round'>, comment: string | null): string {
  const parts = [`样本 ${target.bizId ?? '—'}`, `第 ${target.round + 1} 轮`];
  if (hasText(comment)) {
    const c =
      comment.length > REJECT_COMMENT_MAX ? `${comment.slice(0, REJECT_COMMENT_MAX)}…` : comment;
    parts.push(`意见：${c}`);
  }
  return parts.join(' · ');
}
