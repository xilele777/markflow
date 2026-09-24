// 派发引擎（对应 Java DispatchEngineImpl；规则表 0004 §3）。
// 入池 enqueueToPool 在调用方事务内执行（不加锁，幂等靠 uk_task_case_type_sample）；
// 出池 dispatchPool / dispatchToMember 持 Redis 锁 dispatch:case:{caseId}:pool:{poolType}，
// 每个执行者一个事务：FOR UPDATE SKIP LOCKED 取池内 task → 建个人组 → 逐条条件更新移组 → 写 outbox → 提交后投递。
// 与 Java 的差异：dispatchPool 检查 case RUNNING；已 DONE 的 task 再次入池时「重开」（round+1）；task.bizId 填源样本 bizId。
import type { NewTask, TaskRow } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import { ServiceError } from '../../infra/errors.js';
import type { RedisLock } from '../../infra/lock.js';
import type { Logger } from '../../infra/logger.js';
import type { OutboxService } from '../../infra/outbox.js';
import { QUEUE_NAMES } from '../../infra/queue.js';
import type { DatasetSampleRepository } from '../dataset/dataset-sample.repo.js';
import type { DatasetVersionRepository } from '../dataset/dataset-version.repo.js';
import {
  NotificationRefType,
  NotificationType,
  type NotificationService,
} from '../notification/notification.service.js';
import type { CaseRepository } from './case.repo.js';
import {
  activeExecutors,
  aiConfigOf,
  humanConfigOf,
  isMemberActive,
  readAssignment,
  sameName,
  type AssignmentConfig,
  type MemberConfig,
} from './config.js';
import {
  CaseStatus,
  POOL_TYPE_MAX,
  POOL_TYPE_MIN,
  stageByPoolType,
  Strategy,
  TaskGroupStatus,
  TaskGroupType,
  TaskStatus,
  type StageDef,
} from './enums.js';
import { CaseErrorCode } from './error-codes.js';
import type { TaskGroupRepository } from './task-group.repo.js';
import type { TaskRepository } from './task.repo.js';

export const DEFAULT_PRE_DISPATCH_SIZE = 3;
/** 通知文案用的阶段中文名。 */
export const STAGE_DESC: Record<string, string> = {
  aiPreLabel: 'AI 预标',
  label: '标注',
  aiPreReview: 'AI 预审',
  review: '初检',
  recheck: '复检',
};
const DISPATCH_LOCK = { waitMs: 3_000, leaseMs: 30_000 };
const INIT_ROUND = 1;
/** 可入池的 case 状态：运行中 / 已暂停。 */
const ENQUEUEABLE_STATUSES: readonly number[] = [CaseStatus.RUNNING, CaseStatus.PAUSED];
export const SYSTEM_OPERATOR = 'SYSTEM';

export interface DispatchEngineDeps {
  db: Db;
  cases: CaseRepository;
  groups: TaskGroupRepository;
  tasks: TaskRepository;
  samples: DatasetSampleRepository;
  versions: DatasetVersionRepository;
  lock: RedisLock;
  outbox: OutboxService;
  notifications: NotificationService;
  logger: Logger;
}

export interface EnqueueResult {
  inserted: number;
  reopened: number;
}

export interface DispatchResult {
  /** 成功派出的 task 数。 */
  dispatched: number;
  /** 提交后待投递的 outbox 行。 */
  outboxIds: number[];
}

function requirePoolStage(poolType: unknown): StageDef {
  if (
    typeof poolType !== 'number' ||
    !Number.isInteger(poolType) ||
    poolType < POOL_TYPE_MIN ||
    poolType > POOL_TYPE_MAX
  ) {
    throw ServiceError.of(CaseErrorCode.POOL_TYPE_INVALID);
  }
  const stage = stageByPoolType(poolType);
  if (!stage) throw ServiceError.of(CaseErrorCode.POOL_TYPE_INVALID);
  return stage;
}

function lockName(caseId: number, poolType: number): string {
  return `dispatch:case:${caseId}:pool:${poolType}`;
}

export class DispatchEngine {
  constructor(private readonly deps: DispatchEngineDeps) {}

  /**
   * 入池（在给定事务 trx 内）：新样本插入 status=1；已存在且 DONE 的重开（round+1 回池）；其余已存在跳过。
   * 唯一键冲突（并发插入同一样本）视为已存在。
   */
  async enqueueToPool(
    trx: Db,
    caseId: number,
    poolType: number,
    sampleIds: readonly number[],
    operator: string = SYSTEM_OPERATOR,
  ): Promise<EnqueueResult> {
    const stage = requirePoolStage(poolType);
    const cases = this.deps.cases.withDb(trx);
    const groups = this.deps.groups.withDb(trx);
    const tasks = this.deps.tasks.withDb(trx);
    const samples = this.deps.samples.withDb(trx);

    const caseRow = await cases.selectById(caseId);
    if (!caseRow) throw ServiceError.of(CaseErrorCode.CASE_NOT_FOUND);
    // 暂停中仍允许入池（在手任务提交后下一阶段样本不能丢），只是不派发；已结束拒绝。
    if (!ENQUEUEABLE_STATUSES.includes(caseRow.status)) {
      throw ServiceError.of(CaseErrorCode.CASE_NOT_RUNNING);
    }
    const result: EnqueueResult = { inserted: 0, reopened: 0 };
    const distinct = [...new Set(sampleIds.filter((id) => typeof id === 'number'))];
    if (distinct.length === 0) return result;
    const pool = await groups.selectPoolByCaseAndType(caseId, poolType);
    if (!pool) throw ServiceError.of(CaseErrorCode.POOL_NOT_FOUND);

    const existing = await tasks.selectExistingByCaseTypeAndSamples(caseId, stage.code, distinct);
    const existingBySample = new Map(existing.map((t) => [t.dataSampleId, t]));
    const now = Date.now();
    let seq = await tasks.maxSeqInGroup(pool.id);

    const touchedGroups: number[] = [];
    for (const t of existing) {
      if (t.status !== TaskStatus.DONE) continue;
      seq += 1;
      const n = await tasks.reopenToPool(t.id, pool.id, seq, operator, now);
      if (n > 0) touchedGroups.push(t.taskGroupId);
      result.reopened += n;
    }
    await groups.refreshPersonalGroupStats(touchedGroups, now);

    const fresh = distinct.filter((id) => !existingBySample.has(id));
    if (fresh.length === 0) return result;
    const bizIds = await this.loadBizIds(samples, fresh);
    const rows: NewTask[] = fresh.map((sampleId) => {
      seq += 1;
      return {
        caseId,
        taskGroupId: pool.id,
        taskGroupSeq: seq,
        taskType: stage.code,
        status: TaskStatus.PENDING_DISPATCH,
        round: INIT_ROUND,
        dataSampleId: sampleId,
        bizId: bizIds.get(sampleId) ?? null,
        annotator: null,
        claimTime: null,
        costTime: null,
        ext: null,
        operator,
        createTime: now,
        updateTime: now,
      };
    });
    result.inserted = await tasks.batchInsert(rows);
    if (result.inserted > 0) await groups.increaseTotalCount(pool.id, result.inserted, now);
    return result;
  }

  /** 给某池的全部执行者补题（锁内串行）；返回派出总数。 */
  async dispatchPool(caseId: number, poolType: number): Promise<number> {
    const stage = requirePoolStage(poolType);
    return this.deps.lock.withLock(
      lockName(caseId, poolType),
      CaseErrorCode.OPERATION_CONFLICT,
      async () => {
        const caseRow = await this.requireRunningCase(caseId);
        if (caseRow === null) return 0;
        const assignment = readAssignment(caseRow.assignmentConfig);
        let total = 0;
        for (const executor of activeExecutors(assignment, stage)) {
          total += await this.doDispatchToMember(caseRow, assignment, stage, executor);
        }
        return total;
      },
      DISPATCH_LOCK,
    );
  }

  /** 给单个执行者补题（同一把锁）。 */
  async dispatchToMember(caseId: number, poolType: number, executor: string): Promise<number> {
    const stage = requirePoolStage(poolType);
    return this.deps.lock.withLock(
      lockName(caseId, poolType),
      CaseErrorCode.OPERATION_CONFLICT,
      async () => {
        const caseRow = await this.requireRunningCase(caseId);
        if (caseRow === null) return 0;
        return this.doDispatchToMember(
          caseRow,
          readAssignment(caseRow.assignmentConfig),
          stage,
          executor,
        );
      },
      DISPATCH_LOCK,
    );
  }

  /** 吞异常版本（提交后补题 / 回收后派发），只记 warn。 */
  async dispatchPoolQuietly(caseId: number, poolType: number): Promise<void> {
    try {
      await this.dispatchPool(caseId, poolType);
    } catch (err) {
      this.deps.logger.warn({ err, caseId, poolType }, 'dispatchPool failed (ignored)');
    }
  }

  async dispatchToMemberQuietly(caseId: number, poolType: number, executor: string): Promise<void> {
    try {
      await this.dispatchToMember(caseId, poolType, executor);
    } catch (err) {
      this.deps.logger.warn(
        { err, caseId, poolType, executor },
        'dispatchToMember failed (ignored)',
      );
    }
  }

  /** 运行中返回 case；已暂停返回 null（派发直接返回 0）；其余状态 CASE_NOT_RUNNING。 */
  private async requireRunningCase(caseId: number) {
    const caseRow = await this.deps.cases.selectById(caseId);
    if (!caseRow) throw ServiceError.of(CaseErrorCode.CASE_NOT_FOUND);
    if (caseRow.status === CaseStatus.PAUSED) {
      this.deps.logger.debug({ caseId }, 'dispatch skipped: case paused');
      return null;
    }
    if (caseRow.status !== CaseStatus.RUNNING)
      throw ServiceError.of(CaseErrorCode.CASE_NOT_RUNNING);
    return caseRow;
  }

  /** 无锁内部派题：调用方须已持 case+pool 锁。返回派出数。 */
  private async doDispatchToMember(
    caseRow: {
      id: number;
      name: string;
      labelToolCode: string;
      datasetVersionId: number | null;
    },
    assignment: AssignmentConfig | null,
    stage: StageDef,
    executor: string,
  ): Promise<number> {
    let preDispatchSize: number;
    let strategy: number | null = null;
    if (stage.ai) {
      const ai = aiConfigOf(assignment, stage);
      if (!ai?.aiCode || !sameName(ai.aiCode, executor)) {
        throw ServiceError.of(CaseErrorCode.EXECUTOR_INACTIVE);
      }
      preDispatchSize = ai.preDispatchSize ?? DEFAULT_PRE_DISPATCH_SIZE;
    } else {
      const human = humanConfigOf(assignment, stage);
      const member = human?.members?.find(
        (m) => m.username !== null && sameName(m.username, executor) && isMemberActive(m),
      );
      if (!human || !member) throw ServiceError.of(CaseErrorCode.EXECUTOR_INACTIVE);
      preDispatchSize = human.preDispatchSize ?? DEFAULT_PRE_DISPATCH_SIZE;
      strategy = human.strategy;
    }

    const pool = await this.deps.groups.selectPoolByCaseAndType(caseRow.id, stage.poolType);
    if (!pool) throw ServiceError.of(CaseErrorCode.POOL_NOT_FOUND);

    const result = await this.deps.db.transaction().execute(async (trx) => {
      const groups = this.deps.groups.withDb(trx);
      const tasks = this.deps.tasks.withDb(trx);
      const personal = await groups.selectPersonalGroup(caseRow.id, stage.code, executor);
      const inHand = personal ? await tasks.countInHand(personal.id) : 0;
      let need = preDispatchSize - inHand;
      if (need <= 0) return { dispatched: 0, outboxIds: [] } satisfies DispatchResult;
      if (strategy === Strategy.FIXED_RATIO) {
        const total = await this.resolveStageTotal(caseRow.datasetVersionId);
        const quotas = allocateFixedQuotas(total, humanConfigOf(assignment, stage)?.members ?? []);
        const memberLimit = quotas.get(executor.toLowerCase()) ?? 0;
        const assigned = personal ? await tasks.countByGroup(personal.id) : 0;
        need = Math.min(need, memberLimit - assigned);
        if (need <= 0) return { dispatched: 0, outboxIds: [] } satisfies DispatchResult;
      }
      const taken = await tasks.takeFromPoolForUpdate(pool.id, need);
      if (taken.length === 0) return { dispatched: 0, outboxIds: [] } satisfies DispatchResult;

      const now = Date.now();
      let personalId: number;
      if (personal) {
        personalId = personal.id;
      } else {
        personalId = await groups.insert({
          caseId: caseRow.id,
          stage: stage.code,
          type: TaskGroupType.PERSONAL,
          annotator: executor,
          name: `${caseRow.name}-${executor}-${stage.type}`,
          labelToolCode: caseRow.labelToolCode,
          status: TaskGroupStatus.RUNNING,
          totalCount: 0,
          doneCount: 0,
          costTime: 0,
          ext: null,
          createTime: now,
          updateTime: now,
        });
      }
      let seq = await tasks.maxSeqInGroup(personalId);
      const outboxIds: number[] = [];
      let dispatched = 0;
      for (const task of taken) {
        const newSeq = seq + 1;
        const moved = await tasks.moveToPersonalGroup(
          task.id,
          pool.id,
          personalId,
          inHandStatus(task, stage),
          executor,
          newSeq,
          now,
        );
        if (moved === 0) continue;
        seq = newSeq;
        dispatched += 1;
        outboxIds.push(
          await this.deps.outbox.enqueueTx(trx, {
            queue: QUEUE_NAMES.taskDispatched,
            jobName: 'dispatched',
            payload: {
              caseId: caseRow.id,
              taskId: task.id,
              taskType: stage.code,
              annotator: executor,
              dataSampleId: task.dataSampleId,
              dispatchTime: now,
            },
          }),
        );
      }
      if (dispatched > 0) {
        await groups.refreshPersonalGroupStats([personalId], now);
        if (!stage.ai) {
          // 站内通知（M5）：人工阶段派题后通知执行者；AI 阶段不通知。
          await this.deps.notifications.notify(trx, [
            {
              username: executor,
              type: NotificationType.TASK_DISPATCHED,
              title: `「${caseRow.name}」派发了 ${dispatched} 条${STAGE_DESC[stage.type] ?? stage.type}任务`,
              content: `任务组：${caseRow.name}-${executor}-${stage.type}`,
              refType: NotificationRefType.TASK_GROUP,
              refId: personalId,
            },
          ]);
        }
      }
      return { dispatched, outboxIds } satisfies DispatchResult;
    });
    await this.deps.outbox.deliver(result.outboxIds);
    return result.dispatched;
  }

  private async resolveStageTotal(datasetVersionId: number | null): Promise<number> {
    if (datasetVersionId === null) return 0;
    const version = await this.deps.versions.selectById(datasetVersionId);
    return version?.sampleCount ?? 0;
  }

  private async loadBizIds(
    samples: DatasetSampleRepository,
    sampleIds: readonly number[],
  ): Promise<Map<number, string | null>> {
    const out = new Map<number, string | null>();
    const CHUNK = 1000;
    for (let i = 0; i < sampleIds.length; i += CHUNK) {
      const chunk = sampleIds.slice(i, i + CHUNK);
      for (const row of await samples.selectByIds(chunk)) out.set(row.id, row.bizId);
    }
    return out;
  }
}

/** 最大余数法；同余数按配置顺序分配，active 成员配额之和始终等于总量。 */
export function allocateFixedQuotas(
  total: number,
  members: readonly MemberConfig[],
): Map<string, number> {
  const active = members.filter((member) => isMemberActive(member) && member.username !== null);
  const shares = active.map((member, index) => {
    const exact = (total * (member.ratio ?? 0)) / 100;
    return {
      username: member.username!.toLowerCase(),
      index,
      quota: Math.floor(exact),
      remainder: exact % 1,
    };
  });
  const remaining = total - shares.reduce((sum, share) => sum + share.quota, 0);
  const ranked = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < remaining && i < ranked.length; i += 1) ranked[i]!.quota += 1;
  return new Map(shares.map((share) => [share.username, share.quota]));
}

/** 派入个人组后的状态：原为 REWORK 保持 5；否则标注类 → 2、审核类 → 3。 */
export function inHandStatus(task: Pick<TaskRow, 'status'>, stage: StageDef): number {
  if (task.status === TaskStatus.REWORK) return TaskStatus.REWORK;
  return stage.code <= 2 ? TaskStatus.LABELING : TaskStatus.REVIEWING;
}
