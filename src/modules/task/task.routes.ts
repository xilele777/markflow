// /api/case、/api/task、/api/taskgroup 路由（挂载处已加鉴权中间件）。zod 只约束 JSON 类型；语义校验在服务层。
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app/context.js';
import { requireUser } from '../../app/middleware/auth.js';
import { validateBody } from '../../app/middleware/validate.js';
import { ServiceError } from '../../infra/errors.js';
import { ok, pageOf } from '../../infra/response.js';
import { optionalBoolean, optionalInt, optionalString, pageFields } from '../common/schemas.js';
import { isReviewActionCode, isSampleTypeCode } from './enums.js';
import { TaskErrorCode } from './error-codes.js';
import type { TaskModule } from './module.js';

const aiStage = z
  .object({
    aiCode: optionalString,
    preDispatchSize: optionalInt,
    autoRecycleMinutes: optionalInt,
  })
  .nullable()
  .optional();

const humanStage = z
  .object({
    strategy: optionalInt,
    preDispatchSize: optionalInt,
    autoRecycleMinutes: optionalInt,
    members: z
      .array(
        z
          .object({ username: optionalString, ratio: optionalInt, active: optionalBoolean })
          .nullable(),
      )
      .nullable()
      .optional(),
  })
  .nullable()
  .optional();

const createCaseBody = z.object({
  spaceCode: optionalString,
  name: optionalString,
  description: optionalString,
  dataSourceType: optionalInt,
  datasetVersionId: optionalInt,
  labelTool: optionalString,
  taskPlanConfig: z
    .object({
      stages: z
        .array(z.object({ stage: optionalInt, type: optionalString }).nullable())
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  assignmentConfig: z
    .object({
      aiPreLabel: aiStage,
      label: humanStage,
      aiPreReview: aiStage,
      review: humanStage,
      recheck: humanStage,
    })
    .nullable()
    .optional(),
});

const caseListBody = z.object({
  spaceCode: optionalString,
  status: optionalInt,
  keyword: optionalString,
  ...pageFields,
});
const caseDetailBody = z.object({ caseId: optionalInt });
const exportBody = z.object({ caseId: optionalInt, format: optionalString });

const taskListBody = z.object({ taskGroupId: optionalInt, status: optionalInt, ...pageFields });
const taskIdBody = z.object({ taskId: optionalInt });
const taskResultBody = z.object({ taskId: optionalInt, sampleType: optionalInt });
const saveResultBody = z.object({
  taskId: optionalInt,
  sampleType: optionalInt,
  result: z.unknown().optional(),
});
const submitReviewBody = z.object({
  taskId: optionalInt,
  reviewAction: optionalInt,
  reviewComment: optionalString,
});

const myGroupsBody = z.object({ spaceCode: optionalString, taskType: optionalInt, ...pageFields });
const groupListBody = z.object({
  caseId: optionalInt,
  type: optionalInt,
  keyword: optionalString,
  labelToolCode: optionalString,
  status: optionalInt,
  ...pageFields,
});

/** 边界：sampleType 必填且合法，否则 SAMPLE_TYPE_INVALID（对应 Controller.toSampleType）。 */
function requireSampleType(v: unknown) {
  if (!isSampleTypeCode(v)) throw ServiceError.of(TaskErrorCode.SAMPLE_TYPE_INVALID);
  return v;
}

function requireReviewAction(v: unknown) {
  if (!isReviewActionCode(v)) throw ServiceError.of(TaskErrorCode.REVIEW_ACTION_INVALID);
  return v;
}

export function createCaseRouter(_ctx: AppContext, mod: TaskModule): Router {
  const router = Router();
  const service = mod.caseService;

  router.post('/createCase', validateBody(createCaseBody), async (req, res) => {
    res.json(ok(await service.createCase(requireUser(req), req.body)));
  });
  router.post('/getCaseList', validateBody(caseListBody), async (req, res) => {
    res.json(pageOf(await service.getCaseList(requireUser(req), req.body)));
  });
  router.post('/getCaseDetail', validateBody(caseDetailBody), async (req, res) => {
    res.json(ok(await service.getCaseDetail(requireUser(req), req.body)));
  });
  router.post('/exportCaseResult', validateBody(exportBody), async (req, res) => {
    await service.exportCaseResult(requireUser(req), req.body);
    res.json(ok());
  });
  return router;
}

export function createTaskRouter(_ctx: AppContext, mod: TaskModule): Router {
  const router = Router();
  const service = mod.taskService;

  router.post('/getTaskListInGroup', validateBody(taskListBody), async (req, res) => {
    res.json(pageOf(await service.getTaskListInGroup(requireUser(req), req.body)));
  });
  router.post('/getTaskDetail', validateBody(taskIdBody), async (req, res) => {
    res.json(ok(await service.getTaskDetail(requireUser(req), req.body)));
  });
  router.post('/getSampleData', validateBody(taskIdBody), async (req, res) => {
    res.json(ok(await service.getSampleData(requireUser(req), req.body)));
  });
  router.post('/getTaskResult', validateBody(taskResultBody), async (req, res) => {
    const sampleType = requireSampleType(req.body.sampleType);
    res.json(
      ok(await service.getTaskResult(requireUser(req), { taskId: req.body.taskId, sampleType })),
    );
  });
  router.post('/saveTaskResult', validateBody(saveResultBody), async (req, res) => {
    const sampleType = requireSampleType(req.body.sampleType);
    await service.saveTaskResult(requireUser(req), {
      taskId: req.body.taskId,
      sampleType,
      result: req.body.result ?? null,
    });
    res.json(ok());
  });
  router.post('/submitLabelTask', validateBody(taskIdBody), async (req, res) => {
    await service.submitLabelTask(requireUser(req), req.body);
    res.json(ok());
  });
  router.post('/submitReviewTask', validateBody(submitReviewBody), async (req, res) => {
    const reviewAction = requireReviewAction(req.body.reviewAction);
    await service.submitReviewTask(requireUser(req), {
      taskId: req.body.taskId,
      reviewAction,
      reviewComment: req.body.reviewComment,
    });
    res.json(ok());
  });
  return router;
}

export function createTaskGroupRouter(_ctx: AppContext, mod: TaskModule): Router {
  const router = Router();
  const service = mod.taskGroupService;

  router.post('/getMyTaskGroups', validateBody(myGroupsBody), async (req, res) => {
    res.json(pageOf(await service.getMyTaskGroups(requireUser(req), req.body)));
  });
  router.post('/getTaskGroupList', validateBody(groupListBody), async (req, res) => {
    res.json(pageOf(await service.getTaskGroupList(requireUser(req), req.body)));
  });
  return router;
}
