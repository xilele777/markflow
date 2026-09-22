// GET /api/health：只读探测 pg / redis / S3 / BullMQ；失败 503，不向匿名客户端泄露异常。
import { Router } from 'express';
import { sql } from 'kysely';
import type { AppContext } from '../../app/context.js';
import { CommonErrorCode } from '../../infra/errors.js';
import { fail, ok } from '../../infra/response.js';
import { QUEUE_NAMES } from '../../infra/queue.js';

const PROBE_TIMEOUT_MS = 2000;

interface ProbeResult {
  ok: boolean;
  error?: string;
}

async function probe(fn: () => Promise<unknown>): Promise<ProbeResult> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timeout after ${PROBE_TIMEOUT_MS}ms`)),
      PROBE_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([fn(), timeout]);
    return { ok: true };
  } catch {
    return { ok: false, error: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

export function createHealthRouter(ctx: AppContext): Router {
  const router = Router();
  let pending: Promise<ProbeResult[]> | undefined;
  const inFlight = new Map<string, Promise<unknown>>();
  // 超时结束 HTTP 等待，但 pg / Redis 底层操作可能尚未结束，复用它以限制连接占用。
  const boundedProbe = (name: string, fn: () => Promise<unknown>) =>
    probe(() => {
      let operation = inFlight.get(name);
      if (!operation) {
        operation = Promise.resolve()
          .then(fn)
          .finally(() => {
            inFlight.delete(name);
          });
        inFlight.set(name, operation);
      }
      return operation;
    });
  const check = () =>
    Promise.all([
      boundedProbe('db', () => sql`select 1`.execute(ctx.db)),
      boundedProbe('redis', () => ctx.redis.ping()),
      boundedProbe('storage', () => ctx.storage.checkHealth()),
      boundedProbe('queues', async () => {
        const results = await Promise.allSettled(
          Object.values(QUEUE_NAMES).map(async (name) => {
            const queue = ctx.queues.byName(name)!;
            await queue.getJobCounts('waiting', 'active');
            if (await queue.isPaused()) throw new Error('queue paused');
          }),
        );
        if (results.some((result) => result.status === 'rejected'))
          throw new Error('queue unavailable');
      }),
    ]);

  router.get('/', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    // 1 秒共享结果，避免匿名探针并发扇出。
    if (!pending) {
      pending = check();
      void pending.finally(() => {
        setTimeout(() => {
          pending = undefined;
        }, 1000).unref();
      });
    }
    const checks = await pending;
    const [db, redis, storage, queues] = checks;
    const healthy = checks.every((result) => result.ok);
    const data = {
      status: healthy ? 'ok' : 'degraded',
      checks: { db, redis, storage, queues },
      uptimeSeconds: Math.round(process.uptime()),
      releaseId: ctx.config.server.releaseId,
    };
    if (healthy) {
      res.json(ok(data));
    } else {
      res.status(503).json({ ...fail(CommonErrorCode.SYSTEM_ERROR, 'degraded'), data });
    }
  });

  return router;
}
