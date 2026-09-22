import { Router } from 'express';
import type { AppContext } from '../../app/context.js';
import { requireUser } from '../../app/middleware/auth.js';
import { ok } from '../../infra/response.js';
import { UserRepository } from './user.repo.js';
import { UserService } from './user.service.js';

/** /api/user/*（挂载处已加鉴权中间件）。 */
export function createUserRouter(ctx: AppContext): Router {
  const router = Router();
  const service = new UserService(new UserRepository(ctx.db));

  router.get('/getCurrentUser', async (req, res) => {
    res.json(ok(await service.getCurrentUser(requireUser(req).userId)));
  });

  return router;
}
