// Express 应用装配：日志 → CORS → JSON → 全局限流 → 路由（/api/auth 匿名；其余需 Bearer）→ 404 → 错误处理。
import express, { type Express } from 'express';
import cors, { type CorsOptions } from 'cors';
import type { AppContext } from './context.js';
import { createAuthMiddleware, UserStatusCache } from './middleware/auth.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createRateLimit } from './middleware/rate-limit.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { createAiConfigRouter } from '../modules/aiconfig/aiconfig.routes.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createDatasetRouter } from '../modules/dataset/dataset.routes.js';
import { createHealthRouter } from '../modules/health/health.routes.js';
import { createLabelToolRouter } from '../modules/labeltool/labeltool.routes.js';
import { createMonitoringRouters } from '../modules/monitoring/monitoring.routes.js';
import { createMetricsRouter } from '../modules/monitoring/metrics.routes.js';
import { createNotificationRouter } from '../modules/notification/notification.routes.js';
import { UserRepository } from '../modules/user/user.repo.js';
import { createTaskModule, type TaskModule } from '../modules/task/module.js';
import {
  createCaseRouter,
  createTaskGroupRouter,
  createTaskRouter,
} from '../modules/task/task.routes.js';
import { createUserRouter } from '../modules/user/user.routes.js';
import { createWorkspaceRouter } from '../modules/workspace/workspace.routes.js';

const JSON_BODY_LIMIT = '2mb';
const PREFLIGHT_MAX_AGE_SECONDS = 3600;

function corsOrigin(allowedOrigins: string[]): CorsOptions['origin'] {
  const allowed = new Set(allowedOrigins);
  // 无 Origin（同源 / 非浏览器）放行；跨域仅白名单内回显来源。
  return (origin, callback) => callback(null, !origin || allowed.has(origin));
}

export interface CreateAppOptions {
  /** 复用外部构造的任务域（测试注入假 LLM 时与 worker 共用）。 */
  taskModule?: TaskModule;
}

export function createApp(ctx: AppContext, options: CreateAppOptions = {}): Express {
  const { config, logger } = ctx;
  const taskModule = options.taskModule ?? createTaskModule(ctx);
  const app = express();

  app.set('trust proxy', config.server.trustProxy);
  app.disable('x-powered-by');

  app.use(createRequestLogger(logger));
  app.use(ctx.metrics.middleware());
  // 探针不依赖全局 Redis 限流；metrics 自带专用 token，生产 Nginx 禁止公网访问。
  app.use('/api/health', createHealthRouter(ctx));
  app.use('/api/metrics', createMetricsRouter(ctx));
  app.use(
    cors({
      origin: corsOrigin(config.cors.allowedOrigins),
      credentials: true,
      maxAge: PREFLIGHT_MAX_AGE_SECONDS,
    }),
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(
    createRateLimit({
      redis: ctx.redis,
      logger,
      prefix: 'global',
      windowSeconds: 60,
      max: config.rateLimit.globalPerMinute,
      keyOf: (req) => (req.path === '/api/health' ? null : (req.ip ?? 'unknown')),
      message: '请求过于频繁，请稍后再试',
    }),
  );

  app.use('/api/auth', createAuthRouter(ctx));
  // 前端性能上报：公开（sendBeacon 无法带 Authorization），自带限流；汇总需鉴权。
  const monitoring = createMonitoringRouters(ctx);
  app.use('/api/monitoring', monitoring.publicRouter);

  const userStatusCache = new UserStatusCache();
  const requireAuth = createAuthMiddleware(
    ctx.sysConfig,
    new UserRepository(ctx.db),
    userStatusCache,
  );
  app.use('/api/monitoring', requireAuth, monitoring.adminRouter);
  app.use('/api/user', requireAuth, createUserRouter(ctx, { userStatusCache }));
  app.use('/api/workspace', requireAuth, createWorkspaceRouter(ctx));
  app.use('/api/labeltool', requireAuth, createLabelToolRouter(ctx));
  app.use('/api/aiconfig', requireAuth, createAiConfigRouter(ctx));
  app.use('/api/dataset', requireAuth, createDatasetRouter(ctx));
  app.use('/api/case', requireAuth, createCaseRouter(ctx, taskModule));
  app.use('/api/task', requireAuth, createTaskRouter(ctx, taskModule));
  app.use('/api/taskgroup', requireAuth, createTaskGroupRouter(ctx, taskModule));
  app.use(
    '/api/notification',
    requireAuth,
    createNotificationRouter(ctx, taskModule.notificationService),
  );

  app.use(notFoundHandler());
  app.use(createErrorHandler(logger));
  return app;
}
