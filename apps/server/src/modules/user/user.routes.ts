import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app/context.js';
import { requireUser, type UserStatusCache } from '../../app/middleware/auth.js';
import { validateBody } from '../../app/middleware/validate.js';
import { ok, pageOf } from '../../infra/response.js';
import { PermissionService } from '../common/permission.js';
import { optionalBoolean, optionalInt, optionalString, pageFields } from '../common/schemas.js';
import { TaskStatsRepository } from '../task/task-stats.repo.js';
import { MembershipRepository } from '../workspace/membership.repo.js';
import { ContributionService } from './contribution.service.js';
import { UserRepository } from './user.repo.js';
import { UserService } from './user.service.js';

const createUserBody = z.object({
  username: optionalString,
  displayName: optionalString,
  password: optionalString,
  isSystemAdmin: optionalBoolean,
});

const userListBody = z.object({ keyword: optionalString, ...pageFields });

const changePasswordBody = z.object({ oldPassword: optionalString, newPassword: optionalString });
const userStatusBody = z.object({ userId: optionalInt, status: optionalInt });

const contributionBody = z.object({ username: optionalString });

export interface UserRouterOptions {
  /** 鉴权中间件的启用态缓存；禁用 / 启用后立即失效对应条目。 */
  userStatusCache?: UserStatusCache;
}

/** /api/user/*（挂载处已加鉴权中间件）。 */
export function createUserRouter(ctx: AppContext, options: UserRouterOptions = {}): Router {
  const router = Router();
  const users = new UserRepository(ctx.db);
  const memberships = new MembershipRepository(ctx.db);
  const permissions = new PermissionService(ctx.db);
  const service = new UserService({
    users,
    memberships,
    permissions,
    lock: ctx.lock,
    onStatusChanged: (userId) => options.userStatusCache?.invalidate(userId),
  });
  const contribution = new ContributionService({
    users,
    memberships,
    permissions,
    taskStats: new TaskStatsRepository(ctx.db),
    timeZone: ctx.config.server.timeZone,
  });

  router.post('/create', validateBody(createUserBody), async (req, res) => {
    res.json(ok(await service.createUser(requireUser(req), req.body)));
  });

  router.post('/getUserList', validateBody(userListBody), async (req, res) => {
    res.json(pageOf(await service.getUserList(requireUser(req).userId, req.body)));
  });

  router.get('/getCurrentUser', async (req, res) => {
    res.json(ok(await service.getCurrentUser(requireUser(req).userId)));
  });

  router.post('/changePassword', validateBody(changePasswordBody), async (req, res) => {
    await service.changePassword(requireUser(req), req.body);
    res.json(ok());
  });

  router.post('/updateStatus', validateBody(userStatusBody), async (req, res) => {
    res.json(ok(await service.updateUserStatus(requireUser(req), req.body)));
  });

  router.post('/getMyContribution', validateBody(contributionBody), async (req, res) => {
    res.json(ok(await contribution.getMyContribution(requireUser(req).userId, req.body)));
  });

  return router;
}
