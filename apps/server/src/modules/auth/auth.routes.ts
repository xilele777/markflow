import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app/context.js';
import { validateBody } from '../../app/middleware/validate.js';
import { ok } from '../../infra/response.js';
import { UserRepository } from '../user/user.repo.js';
import { AuthService } from './auth.service.js';
import { LoginAttemptLimiter } from './login-limiter.js';

// 只约束类型，空值判断交给领域层（返回 Java 同款 INVALID_PARAM 文案）。
const loginBodySchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
});

/** /api/auth/*（匿名）。 */
export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();
  const limiter = new LoginAttemptLimiter(ctx.redis, ctx.logger, {
    maxFailures: ctx.config.rateLimit.loginMaxFailures,
    windowSeconds: ctx.config.rateLimit.loginWindowMinutes * 60,
  });
  const service = new AuthService({
    users: new UserRepository(ctx.db),
    sysConfig: ctx.sysConfig,
    limiter,
  });

  router.post('/login', validateBody(loginBodySchema), async (req, res) => {
    res.json(ok(await service.login(req.body, req.ip ?? 'unknown')));
  });

  return router;
}
