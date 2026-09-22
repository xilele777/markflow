import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app/context.js';
import { requireUser } from '../../app/middleware/auth.js';
import { validateBody } from '../../app/middleware/validate.js';
import { ok, pageOf } from '../../infra/response.js';
import { PermissionService } from '../common/permission.js';
import { optionalInt, optionalString, pageFields } from '../common/schemas.js';
import { UserRepository } from '../user/user.repo.js';
import { MembershipRepository } from './membership.repo.js';
import { WorkspaceRepository } from './workspace.repo.js';
import { WorkspaceService } from './workspace.service.js';

const createWorkspaceBody = z.object({
  spaceCode: optionalString,
  name: optionalString,
  description: optionalString,
});

const workspaceListBody = z.object({ keyword: optionalString, ...pageFields });

const addMemberBody = z.object({
  workspaceId: optionalInt,
  members: z
    .array(
      z.object({
        userId: optionalInt,
        roles: z.array(z.number().int().nullable()).nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

const workspaceDetailBody = z.object({ workspaceId: optionalInt });

/** /api/workspace/*（挂载处已加鉴权中间件）。 */
export function createWorkspaceRouter(ctx: AppContext): Router {
  const router = Router();
  const service = new WorkspaceService({
    workspaces: new WorkspaceRepository(ctx.db),
    memberships: new MembershipRepository(ctx.db),
    users: new UserRepository(ctx.db),
    permissions: new PermissionService(ctx.db),
    lock: ctx.lock,
  });

  router.post('/createWorkspace', validateBody(createWorkspaceBody), async (req, res) => {
    res.json(ok(await service.createWorkspace(requireUser(req), req.body)));
  });

  router.post('/getWorkspaceList', validateBody(workspaceListBody), async (req, res) => {
    res.json(pageOf(await service.getWorkspaceList(requireUser(req).userId, req.body)));
  });

  router.post('/addWorkspaceMember', validateBody(addMemberBody), async (req, res) => {
    res.json(ok(await service.addWorkspaceMember(requireUser(req), req.body)));
  });

  router.post('/getWorkspaceDetail', validateBody(workspaceDetailBody), async (req, res) => {
    res.json(ok(await service.getWorkspaceDetail(requireUser(req).userId, req.body)));
  });

  return router;
}
