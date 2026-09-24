import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { RequestHandler } from 'express';
import type { AppContext } from '../app/context.js';
import { QUEUE_NAMES } from './queue.js';

/** 每个应用独立注册表；标签不含用户、case、URL 参数或错误文本。 */
export class Metrics {
  readonly registry = new Registry();
  readonly ai = new Counter({
    name: 'markflow_ai_executions_total',
    help: 'AI execution attempts (retries counted separately; skipped excluded)',
    labelNames: ['stage', 'outcome'] as const,
    registers: [this.registry],
  });
  private readonly requests = new Histogram({
    name: 'markflow_http_request_duration_seconds',
    help: 'HTTP response duration, including failures',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });
  private readonly pools = new Gauge({
    name: 'markflow_pool_pending_tasks',
    help: 'Unassigned tasks in running or paused cases, by stage',
    labelNames: ['stage'] as const,
    registers: [this.registry],
  });
  private readonly queues = new Gauge({
    name: 'markflow_queue_jobs',
    help: 'BullMQ jobs by queue and state (failed retains at most 1000)',
    labelNames: ['queue', 'state'] as const,
    registers: [this.registry],
  });
  private readonly outbox = new Gauge({
    name: 'markflow_outbox_pending_messages',
    help: 'Messages awaiting delivery to BullMQ',
    registers: [this.registry],
  });
  private readonly outboxAge = new Gauge({
    name: 'markflow_outbox_oldest_age_seconds',
    help: 'Age of oldest pending outbox message, zero when empty',
    registers: [this.registry],
  });
  private collecting: Promise<void> | undefined;

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'markflow_' });
  }

  middleware(): RequestHandler {
    return (req, res, next) => {
      const start = process.hrtime.bigint();
      res.once('finish', () => {
        const path: unknown = req.route?.path;
        // baseUrl 在错误处理时可能被 Express 恢复，用固定模块前缀 + 已匹配路由模板。
        const module = /^\/api\/[a-z]+(?=\/|$)/.exec(req.originalUrl.split('?')[0] ?? '')?.[0];
        const route =
          typeof path === 'string' && module ? `${module}${path === '/' ? '' : path}` : 'unmatched';
        const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(
          req.method,
        )
          ? req.method
          : 'OTHER';
        this.requests.observe(
          { method, route, status: String(res.statusCode) },
          Number(process.hrtime.bigint() - start) / 1e9,
        );
      });
      next();
    };
  }

  /** 单次在途采集，依赖阻塞时并发 scrape 不会无限堆积查询。 */
  refresh(ctx: AppContext): Promise<void> {
    this.collecting ??= this.collect(ctx).finally(() => {
      this.collecting = undefined;
    });
    return this.collecting;
  }

  private async collect(ctx: AppContext): Promise<void> {
    const states = [
      'waiting',
      'active',
      'delayed',
      'failed',
      'prioritized',
      'waiting-children',
    ] as const;
    const [poolResult, outboxResult, queueResult] = await Promise.allSettled([
      ctx.db
        .selectFrom('label_task as t')
        .innerJoin('label_task_group as g', 'g.id', 't.taskGroupId')
        .innerJoin('label_case as c', 'c.id', 't.caseId')
        .select(['t.taskType as stage', ctx.db.fn.countAll<number>().as('count')])
        .where('g.type', '>=', 2)
        .where('g.type', '<=', 6)
        .where('t.status', 'in', [1, 5])
        .where('c.deleted', '=', 0)
        .where('c.status', 'in', [2, 3])
        .groupBy('t.taskType')
        .execute(),
      ctx.db
        .selectFrom('mq_outbox')
        .select([
          ctx.db.fn.countAll<number>().as('count'),
          ctx.db.fn.min<number>('createTime').as('oldest'),
        ])
        .where('status', '=', 1)
        .executeTakeFirstOrThrow(),
      Promise.allSettled(
        Object.values(QUEUE_NAMES).map(async (name) => ({
          name,
          counts: await ctx.queues.byName(name)!.getJobCounts(...states),
        })),
      ),
    ]);
    // 等全部操作 settled 才释放 single-flight，不能因一个早失败而累积其它未完成查询。
    if (
      poolResult.status === 'rejected' ||
      outboxResult.status === 'rejected' ||
      queueResult.status === 'rejected'
    ) {
      throw new Error('metrics dependency unavailable');
    }
    const pools = poolResult.value;
    const outbox = outboxResult.value;
    const queues = queueResult.value.map((result) => {
      if (result.status === 'rejected') throw new Error('queue metrics unavailable');
      return result.value;
    });
    for (let stage = 1; stage <= 5; stage++) {
      this.pools.set(
        { stage: String(stage) },
        Number(pools.find((row) => row.stage === stage)?.count ?? 0),
      );
    }
    this.outbox.set(Number(outbox.count));
    this.outboxAge.set(
      outbox.oldest === null ? 0 : Math.max(0, (Date.now() - Number(outbox.oldest)) / 1000),
    );
    for (const { name, counts } of queues) {
      for (const state of states) this.queues.set({ queue: name, state }, counts[state] ?? 0);
    }
  }
}
