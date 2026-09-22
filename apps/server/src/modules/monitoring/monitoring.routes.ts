// /api/monitoring/*：
//   POST /reportWebVitals  公开（sendBeacon 不带 Authorization、Content-Type 为 text/plain），独立限流，恒 204。
//   POST /getWebVitalsSummary  需 Bearer + 系统管理员：各指标 p75 / rating 分布 / 按天趋势。
// 挂载：公开路由在 requireAuth 之前，汇总路由由本文件内自行套鉴权中间件。
import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app/context.js';
import { requireUser } from '../../app/middleware/auth.js';
import { createRateLimit } from '../../app/middleware/rate-limit.js';
import { validateBody } from '../../app/middleware/validate.js';
import { ok } from '../../infra/response.js';
import { PermissionService } from '../common/permission.js';
import { optionalInt } from '../common/schemas.js';
import { MonitoringService, parseWebVital } from './monitoring.service.js';

/** sendBeacon 每页最多发 5 个指标，正常用户每分钟远小于此；按 IP 限。 */
const REPORT_WINDOW_SECONDS = 60;
const REPORT_BODY_LIMIT = '16kb';

const summaryBody = z.object({ days: optionalInt });

export interface MonitoringRouters {
  /** 公开路由（无鉴权）。 */
  publicRouter: Router;
  /** 需鉴权路由（调用方在挂载处套 requireAuth）。 */
  adminRouter: Router;
}

export function createMonitoringService(ctx: AppContext): MonitoringService {
  return new MonitoringService({
    db: ctx.db,
    logger: ctx.logger,
    permissions: new PermissionService(ctx.db),
    timeZone: ctx.config.server.timeZone,
  });
}

export function createMonitoringRouters(
  ctx: AppContext,
  service = createMonitoringService(ctx),
): MonitoringRouters {
  const publicRouter = Router();
  const adminRouter = Router();

  // sendBeacon 发 text/plain（也兼容 application/json 已被全局 json 解析的情况）。
  const textParser: RequestHandler = express.text({ type: () => true, limit: REPORT_BODY_LIMIT });
  const reportLimit = createRateLimit({
    redis: ctx.redis,
    logger: ctx.logger,
    prefix: 'webvitals',
    windowSeconds: REPORT_WINDOW_SECONDS,
    max: ctx.config.rateLimit.webVitalsPerMinute,
    keyOf: (req) => req.ip ?? 'unknown',
    message: '上报过于频繁',
  });

  publicRouter.post('/reportWebVitals', reportLimit, textParser, async (req, res) => {
    const input = parseWebVital(req.body);
    if (input) await service.recordWebVital(input);
    res.status(204).end();
  });

  adminRouter.post('/getWebVitalsSummary', validateBody(summaryBody), async (req, res) => {
    const data = await service.getWebVitalsSummary(requireUser(req).userId, req.body.days);
    res.json(ok(data));
  });

  return { publicRouter, adminRouter };
}
