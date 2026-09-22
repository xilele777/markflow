// GET /api/health：探测 pg / redis；全部正常 200 status=ok，否则 503 status=degraded（LabelHub 资产）。
import { Router } from 'express';
import { sql } from 'kysely';
import type { AppContext } from '../../app/context.js';
import { CommonErrorCode } from '../../infra/errors.js';
import { fail, ok } from '../../infra/response.js';

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
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function createHealthRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const [db, redis] = await Promise.all([
      probe(() => sql`select 1`.execute(ctx.db)),
      probe(() => ctx.redis.ping()),
    ]);
    const healthy = db.ok && redis.ok;
    const data = {
      status: healthy ? 'ok' : 'degraded',
      checks: { db, redis },
      uptimeSeconds: Math.round(process.uptime()),
    };
    if (healthy) {
      res.json(ok(data));
    } else {
      res.status(503).json({ ...fail(CommonErrorCode.SYSTEM_ERROR, 'degraded'), data });
    }
  });

  return router;
}
