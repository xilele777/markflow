import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { AppContext } from '../../app/context.js';

export function createMetricsRouter(ctx: AppContext): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const secret = ctx.config.monitoring.metricsToken;
    if (!secret) {
      res.sendStatus(404);
      return;
    }
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.sendStatus(401);
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        ctx.metrics.refresh(ctx),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('metrics timeout')), 3000);
        }),
      ]);
      res.type(ctx.metrics.registry.contentType).send(await ctx.metrics.registry.metrics());
    } catch (err) {
      ctx.logger.warn({ err }, 'metrics collection failed');
      res.status(503).type('text/plain').send('metrics unavailable\n');
    } finally {
      clearTimeout(timer);
    }
  });
  return router;
}
