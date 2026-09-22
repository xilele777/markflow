import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app/context.js';
import { requireUser } from '../../app/middleware/auth.js';
import { validateBody } from '../../app/middleware/validate.js';
import { ok, pageOf } from '../../infra/response.js';
import { PermissionService } from '../common/permission.js';
import { optionalInt, optionalString, pageFields } from '../common/schemas.js';
import { LabelToolRepository } from '../labeltool/labeltool.repo.js';
import { WorkspaceRepository } from '../workspace/workspace.repo.js';
import { DatasetSampleRepository } from './dataset-sample.repo.js';
import { DatasetVersionRepository } from './dataset-version.repo.js';
import { DatasetRepository } from './dataset.repo.js';
import { DatasetService } from './dataset.service.js';

const createDatasetBody = z.object({
  spaceCode: optionalString,
  datasetName: optionalString,
  datasetDesc: optionalString,
  labelToolCode: optionalString,
  ossPath: optionalString,
  versionDesc: optionalString,
});

const createVersionBody = z.object({
  datasetId: optionalInt,
  ossPath: optionalString,
  versionDesc: optionalString,
});

const datasetListBody = z.object({
  spaceCode: optionalString,
  keyword: optionalString,
  ...pageFields,
});
const datasetDetailBody = z.object({ datasetId: optionalInt });
const samplePreviewBody = z.object({ versionId: optionalInt });
const presignBody = z.object({ fileName: optionalString });

export function createDatasetService(ctx: AppContext): DatasetService {
  return new DatasetService({
    db: ctx.db,
    datasets: new DatasetRepository(ctx.db),
    versions: new DatasetVersionRepository(ctx.db),
    samples: new DatasetSampleRepository(ctx.db),
    labelTools: new LabelToolRepository(ctx.db),
    workspaces: new WorkspaceRepository(ctx.db),
    permissions: new PermissionService(ctx.db),
    lock: ctx.lock,
    storage: ctx.storage,
    queues: ctx.queues,
    logger: ctx.logger,
    timeZone: ctx.config.server.timeZone,
  });
}

/** /api/dataset/*（挂载处已加鉴权中间件）。 */
export function createDatasetRouter(ctx: AppContext): Router {
  const router = Router();
  const service = createDatasetService(ctx);

  router.post('/createDataset', validateBody(createDatasetBody), async (req, res) => {
    res.json(ok(await service.createDataset(requireUser(req), req.body)));
  });

  router.post('/createDatasetVersion', validateBody(createVersionBody), async (req, res) => {
    res.json(ok(await service.createDatasetVersion(requireUser(req), req.body)));
  });

  router.post('/getDatasetList', validateBody(datasetListBody), async (req, res) => {
    res.json(pageOf(await service.getDatasetList(requireUser(req).userId, req.body)));
  });

  router.post('/getDatasetDetail', validateBody(datasetDetailBody), async (req, res) => {
    res.json(ok(await service.getDatasetDetail(requireUser(req).userId, req.body)));
  });

  router.post('/getVersionSamplePreview', validateBody(samplePreviewBody), async (req, res) => {
    res.json(ok(await service.getVersionSamplePreview(requireUser(req).userId, req.body)));
  });

  router.post('/getUploadPreSignedUrl', validateBody(presignBody), async (req, res) => {
    res.json(ok(await service.getUploadPreSignedUrl(requireUser(req).userId, req.body)));
  });

  return router;
}
