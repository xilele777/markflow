import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app/context.js';
import { requireUser } from '../../app/middleware/auth.js';
import { validateBody } from '../../app/middleware/validate.js';
import { ok } from '../../infra/response.js';
import { PermissionService } from '../common/permission.js';
import { optionalString } from '../common/schemas.js';
import { LabelToolRepository } from '../labeltool/labeltool.repo.js';
import { AiConfigService } from './aiconfig.service.js';

const createAiConfigBody = z.object({
  aiCode: optionalString,
  name: optionalString,
  labelToolCode: optionalString,
  baseUrl: optionalString,
  apiKey: optionalString,
  model: optionalString,
  prompt: optionalString,
});

const updateAiConfigBody = z.object({
  aiCode: optionalString,
  name: optionalString,
  baseUrl: optionalString,
  apiKey: optionalString,
  model: optionalString,
  prompt: optionalString,
});

const aiConfigListBody = z.object({ labelToolCode: optionalString });

/** /api/aiconfig/*（挂载处已加鉴权中间件）。 */
export function createAiConfigRouter(ctx: AppContext): Router {
  const router = Router();
  const service = new AiConfigService({
    sysConfig: ctx.sysConfig,
    secretBox: ctx.secretBox,
    permissions: new PermissionService(ctx.db),
    labelTools: new LabelToolRepository(ctx.db),
    lock: ctx.lock,
  });

  router.post('/createAiConfig', validateBody(createAiConfigBody), async (req, res) => {
    await service.createAiConfig(requireUser(req), req.body);
    res.json(ok());
  });

  router.post('/updateAiConfig', validateBody(updateAiConfigBody), async (req, res) => {
    await service.updateAiConfig(requireUser(req), req.body);
    res.json(ok());
  });

  router.post('/getAiConfigList', validateBody(aiConfigListBody), async (req, res) => {
    res.json(ok(await service.getAiConfigList(requireUser(req).userId, req.body)));
  });

  return router;
}
