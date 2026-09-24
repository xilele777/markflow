// 任务域三个队列消费者（对应 Java TaskDispatchDomainMessageConsumer / TaskCompletedConsumer / CaseExportConsumer）
// 与自动回收定时器（对应 TaskAutoRecycleScheduler）。规则表 0004 §3.3、§7、§8.2。
import type { Worker } from 'bullmq';
import type { AppContext } from '../../app/context.js';
import {
  createWorker,
  QUEUE_NAMES,
  type CaseExportJob,
  type TaskCompletedJob,
  type TaskDispatchedJob,
} from '../../infra/queue.js';
import { AiExecutionError } from './ai-task-executor.js';
import { CaseStatus, TaskStatus, isTaskTypeCode, stageByCode } from './enums.js';
import { nextStageInPlan, readTaskPlan } from './config.js';
import type { TaskModule } from './module.js';

const AUTO_RECYCLE_INTERVAL_MS = 60_000;
/** 锁名带队列前缀：多套环境（dev / test）共用一个 Redis 时互不干扰。 */
const AUTO_RECYCLE_LOCK = 'schedule:task_auto_recycle';
const AUTO_RECYCLE_LOCK_OPTIONS = { waitMs: 0, leaseMs: 120_000 };

/** task-dispatched：AI 类型执行；瞬时失败抛出重试；人工类型仅记日志。 */
export function createTaskDispatchedWorker(
  ctx: AppContext,
  mod: TaskModule,
): Worker<TaskDispatchedJob> {
  const worker = createWorker<TaskDispatchedJob>(
    QUEUE_NAMES.taskDispatched,
    async (job) => {
      const { taskId, taskType, annotator } = job.data ?? {};
      if (typeof taskId !== 'number' || !isTaskTypeCode(taskType)) {
        ctx.logger.warn({ jobId: job.id, data: job.data }, 'task-dispatched job invalid');
        return;
      }
      if (!stageByCode(taskType)?.ai) {
        ctx.logger.info({ taskId, taskType, annotator }, 'task-dispatched: human task (no-op)');
        return;
      }
      await mod.aiExecutor.execute(taskId, job.attemptsMade + 1);
    },
    ctx.config,
    { concurrency: 2 },
  );
  worker.on('failed', (job, err) => {
    const retryable = err instanceof AiExecutionError ? err.retryable : undefined;
    ctx.logger.error(
      { err, jobId: job?.id, data: job?.data, attemptsMade: job?.attemptsMade, retryable },
      'task-dispatched job failed',
    );
  });
  worker.on('error', (err) => ctx.logger.warn({ err }, 'task-dispatched worker error'));
  return worker;
}

/** task-completed：下一阶段入池 + 派发；异常上抛由 BullMQ 重试（入池幂等）。 */
export function createTaskCompletedWorker(
  ctx: AppContext,
  mod: TaskModule,
): Worker<TaskCompletedJob> {
  const worker = createWorker<TaskCompletedJob>(
    QUEUE_NAMES.taskCompleted,
    async (job) => {
      const data = job.data ?? ({} as TaskCompletedJob);
      if (typeof data.caseId !== 'number' || typeof data.dataSampleId !== 'number') {
        ctx.logger.warn({ jobId: job.id, data }, 'task-completed job invalid');
        return;
      }
      await processTaskCompleted(ctx, mod, data);
    },
    ctx.config,
    { concurrency: 1 },
  );
  worker.on('failed', (job, err) => {
    ctx.logger.error(
      { err, jobId: job?.id, data: job?.data, attemptsMade: job?.attemptsMade },
      'task-completed job failed',
    );
  });
  worker.on('error', (err) => ctx.logger.warn({ err }, 'task-completed worker error'));
  return worker;
}

/** 轮次校验、推进标记与下游入池同事务；重投仅重试事务外的派发。 */
export async function processTaskCompleted(
  ctx: AppContext,
  mod: TaskModule,
  data: TaskCompletedJob,
): Promise<void> {
  const next = await ctx.db.transaction().execute(async (trx) => {
    const source = await trx
      .selectFrom('label_task')
      .selectAll()
      .where('id', '=', data.taskId)
      .forUpdate()
      .executeTakeFirst();
    if (
      !source ||
      source.status !== TaskStatus.DONE ||
      source.caseId !== data.caseId ||
      source.dataSampleId !== data.dataSampleId
    )
      return undefined;
    const round =
      data.round ?? (source.updateTime === data.completedTime ? source.round : undefined);
    if (round !== source.round) return undefined;
    const current = stageByCode(source.taskType);
    if (!current || current.type !== data.currentStageType) return undefined;
    const caseRow = await trx
      .selectFrom('label_case')
      .selectAll()
      .where('id', '=', source.caseId)
      .executeTakeFirst();
    if (!caseRow || caseRow.status === CaseStatus.FINISHED) return undefined;
    const target = nextStageInPlan(readTaskPlan(caseRow.taskPlanConfig), current);
    if ((target?.type ?? null) !== data.nextStageType) return undefined;
    if (source.forwardedRound < round) {
      if (target)
        await mod.dispatch.enqueueToPool(trx, source.caseId, target.poolType, [
          source.dataSampleId,
        ]);
      await trx
        .updateTable('label_task')
        .set({ forwardedRound: round })
        .where('id', '=', source.id)
        .execute();
    }
    return target;
  });
  if (next === undefined) return;
  if (next === null) await mod.taskService.finishCaseIfDone(data.caseId);
  else await mod.dispatch.dispatchPool(data.caseId, next.poolType);
}

/** case-export：导出服务内部消化全部异常，job 总是 completed。 */
export function createCaseExportWorker(ctx: AppContext, mod: TaskModule): Worker<CaseExportJob> {
  const worker = createWorker<CaseExportJob>(
    QUEUE_NAMES.caseExport,
    async (job) => {
      const { caseId, format, operator } = job.data ?? ({} as CaseExportJob);
      if (typeof caseId !== 'number' || typeof format !== 'string') {
        ctx.logger.warn({ jobId: job.id, data: job.data }, 'case-export job invalid');
        return;
      }
      await mod.exportService.exportCaseResult(caseId, format, operator ?? 'SYSTEM');
    },
    ctx.config,
    { concurrency: 1 },
  );
  worker.on('failed', (job, err) => {
    ctx.logger.error({ err, jobId: job?.id, data: job?.data }, 'case-export job failed');
  });
  worker.on('error', (err) => ctx.logger.warn({ err }, 'case-export worker error'));
  return worker;
}

const DEADLINE_INTERVAL_MS = 60_000;
const DEADLINE_LOCK = 'schedule:case_deadline';

/** 截止扫描：每分钟一次，锁 schedule:case_deadline，拿不到就跳过（多实例只跑一份）。 */
export function startDeadlineScheduler(
  ctx: AppContext,
  mod: TaskModule,
  intervalMs = DEADLINE_INTERVAL_MS,
): AutoRecycleScheduler {
  let running: Promise<unknown> = Promise.resolve();
  const lockName = `${ctx.config.queue.prefix}:${DEADLINE_LOCK}`;
  const runOnce = async (): Promise<number> => {
    const token = await ctx.lock.tryLock(lockName, AUTO_RECYCLE_LOCK_OPTIONS);
    if (token === null) return 0;
    try {
      const sent = await mod.caseService.scanDeadlines();
      if (sent > 0) ctx.logger.info({ sent }, 'deadline scan done');
      return sent;
    } catch (err) {
      ctx.logger.error({ err }, 'deadline scan failed');
      return 0;
    } finally {
      await ctx.lock.unlock(lockName, token).catch(() => undefined);
    }
  };
  const timer = setInterval(() => {
    running = runOnce();
  }, intervalMs);
  timer.unref();
  return {
    runOnce,
    async stop() {
      clearInterval(timer);
      await running;
    },
  };
}

export interface AutoRecycleScheduler {
  /** 立即执行一次扫描（测试用；受同一把锁约束）。 */
  runOnce(): Promise<number>;
  stop(): Promise<void>;
}

/** 自动回收：每分钟一次，锁 schedule:task_auto_recycle（wait 0 / lease 120s）拿不到就跳过。 */
export function startAutoRecycleScheduler(
  ctx: AppContext,
  mod: TaskModule,
  intervalMs = AUTO_RECYCLE_INTERVAL_MS,
): AutoRecycleScheduler {
  let running: Promise<unknown> = Promise.resolve();
  const lockName = `${ctx.config.queue.prefix}:${AUTO_RECYCLE_LOCK}`;
  const runOnce = async (): Promise<number> => {
    const token = await ctx.lock.tryLock(lockName, AUTO_RECYCLE_LOCK_OPTIONS);
    if (token === null) return 0;
    try {
      const recycled = await mod.taskService.autoRecycleOverdueTasks();
      if (recycled > 0) ctx.logger.info({ recycled }, 'auto-recycle scan done');
      return recycled;
    } catch (err) {
      ctx.logger.error({ err }, 'auto-recycle scan failed');
      return 0;
    } finally {
      await ctx.lock.unlock(lockName, token).catch(() => undefined);
    }
  };
  const timer = setInterval(() => {
    running = runOnce();
  }, intervalMs);
  timer.unref();
  return {
    runOnce,
    async stop() {
      clearInterval(timer);
      await running;
    },
  };
}
