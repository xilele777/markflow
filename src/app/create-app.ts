// Express 应用装配：日志 → CORS → JSON → 全局限流 → 路由（/api/auth 匿名；其余需 Bearer）→ 404 → 错误处理。
import express, { type Express } from 'express';
import cors, { type CorsOptions } from 'cors';
import type { AppContext } from './context.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createRateLimit } from './middleware/rate-limit.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { createAiConfigRouter } from '../modules/aiconfig/aiconfig.routes.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createDatasetRouter } from '../modules/dataset/dataset.routes.js';
import { createHealthRouter } from '../modules/health/health.routes.js';
import { createLabelToolRouter } from '../modules/labeltool/labeltool.routes.js';
import { createUserRouter } from '../modules/user/user.routes.js';
import { createWorkspaceRouter } from '../modules/workspace/workspace.routes.js';

const JSON_BODY_LIMIT = '2mb';
const PREFLIGHT_MAX_AGE_SECONDS = 3600;

function corsOrigin(allowedOrigins: string[]): CorsOptions['origin'] {
  const allowed = new Set(allowedOrigins);
  // 无 Origin（同源 / 非浏览器）放行；跨域仅白名单内回显来源。
  return (origin, callback) => callback(null, !origin || allowed.has(origin));
}

export function createApp(ctx: AppContext): Express {
  const { config, logger } = ctx;
  const app = express();

  app.set('trust proxy', config.server.trustProxy);
  app.disable('x-powered-by');

  app.use(createRequestLogger(logger));
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

  app.use('/api/health', createHealthRouter(ctx));
  app.use('/api/auth', createAuthRouter(ctx));

  const requireAuth = createAuthMiddleware(ctx.sysConfig);
  app.use('/api/user', requireAuth, createUserRouter(ctx));
  app.use('/api/workspace', requireAuth, createWorkspaceRouter(ctx));
  app.use('/api/labeltool', requireAuth, createLabelToolRouter(ctx));
  app.use('/api/aiconfig', requireAuth, createAiConfigRouter(ctx));
  app.use('/api/dataset', requireAuth, createDatasetRouter(ctx));

  app.use(notFoundHandler());
  app.use(createErrorHandler(logger));
  return app;
}
