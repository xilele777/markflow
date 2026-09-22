import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app/context.js';
import { requireUser } from '../../app/middleware/auth.js';
import { validateBody } from '../../app/middleware/validate.js';
import { ok, pageOf } from '../../infra/response.js';
import { PermissionService } from '../common/permission.js';
import { optionalInt, optionalString, pageFields } from '../common/schemas.js';
import { LabelToolRepository } from './labeltool.repo.js';
import { LabelToolService } from './labeltool.service.js';

const createLabelToolBody = z.object({
  labelToolCode: optionalString,
  labelToolName: optionalString,
  labelToolType: optionalInt,
  labelToolUrl: optionalString,
  labelToolJsonSchema: z.unknown().optional(),
  labelToolPageSchema: z.unknown().optional(),
});

const labelToolListBody = z.object({ keyword: optionalString, ...pageFields });

const labelToolDetailBody = z.object({ labelToolId: optionalInt });

/** /api/labeltool/*（挂载处已加鉴权中间件）。 */
export function createLabelToolRouter(ctx: AppContext): Router {
  const router = Router();
  const service = new LabelToolService({
    labelTools: new LabelToolRepository(ctx.db),
    permissions: new PermissionService(ctx.db),
    lock: ctx.lock,
  });

  router.post('/createLabelTool', validateBody(createLabelToolBody), async (req, res) => {
    res.json(ok(await service.createLabelTool(requireUser(req), req.body)));
  });

  router.post('/getLabelToolList', validateBody(labelToolListBody), async (req, res) => {
    res.json(pageOf(await service.getLabelToolList(requireUser(req).userId, req.body)));
  });

  router.post('/getLabelToolDetail', validateBody(labelToolDetailBody), async (req, res) => {
    res.json(ok(await service.getLabelToolDetail(requireUser(req).userId, req.body)));
  });

  return router;
}
