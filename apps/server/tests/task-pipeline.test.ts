// 任务流水线端到端：建 case → 派发 → 标注提交 → 自动推进 → 审核通过 / 驳回（留组 / 回池）→ 重标 → 二轮质检 → 末阶段。
// 消费者在本进程内启动（假 LLM 不参与本文件）；断言直接查库 + 走接口。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TaskStatus, TaskType, TaskGroupType } from '../src/modules/task/enums.js';
import {
  caseBody,
  createCaseOk,
  createFixture,
  createPipelineHarness,
  labelAndSubmit,
  post,
  review,
  selectGroups,
  selectTasks,
  waitFor,
  waitForTask,
  type Fixture,
  type PipelineHarness,
} from './helpers/pipeline.js';

describe('任务流水线（label → review → recheck）', () => {
  let h: PipelineHarness;
  let f: Fixture;

  beforeAll(async () => {
    h = await createPipelineHarness();
    await h.startWorkers();
    f = await createFixture(h.ctx, h.app, 3);
  });
  afterAll(() => h.close());

  const taskOf = (caseId: number, taskType: number, sampleId: number) =>
    h.ctx.db
      .selectFrom('label_task')
      .selectAll()
      .where('caseId', '=', caseId)
      .where('taskType', '=', taskType)
      .where('dataSampleId', '=', sampleId)
      .executeTakeFirstOrThrow();

  describe('任务接口权限与读取', () => {
    let caseId: number;
    let taskId: number;
    beforeAll(async () => {
      caseId = await createCaseOk(h.app, f.labelAdmin.token, caseBody(f, { preDispatchSize: 2 }));
      taskId = (await taskOf(caseId, TaskType.LABEL, f.sampleIds[0]!)).id;
    });

    it('getMyTaskGroups：标注员看到自己的个人组；空间过滤；taskType 非法', async () => {
      const res = await post(h.app, '/api/taskgroup/getMyTaskGroups', f.labeler1.token, {
        spaceCode: f.spaceCode,
      });
      expect(res.body.success).toBe(true);
      const mine = res.body.data.find((g: { caseId: number }) => g.caseId === caseId);
      expect(mine).toMatchObject({
        taskType: 2,
        spaceCode: f.spaceCode,
        labelTool: f.toolCode,
        status: 2,
      });
      expect(mine.caseName).toBeTruthy();
      expect(
        (
          await post(h.app, '/api/taskgroup/getMyTaskGroups', f.reviewer.token, {
            spaceCode: f.spaceCode,
          })
        ).body.data.some((g: { caseId: number }) => g.caseId === caseId),
      ).toBe(false);
      expect(
        (await post(h.app, '/api/taskgroup/getMyTaskGroups', f.labeler1.token, { taskType: 9 }))
          .body.code,
      ).toBe('PARAM_INVALID');
      expect(
        (
          await post(h.app, '/api/taskgroup/getMyTaskGroups', f.labeler1.token, {
            spaceCode: 'nope',
          })
        ).body.total,
      ).toBe(0);
    });

    it('getTaskGroupList：仅系统管理员；按 case / type / keyword 过滤', async () => {
      expect(
        (await post(h.app, '/api/taskgroup/getTaskGroupList', f.labelAdmin.token, { caseId }))
          .status,
      ).toBe(403);
      const { adminToken } = await import('./helpers/app.js');
      const admin = await adminToken(h.app);
      const all = await post(h.app, '/api/taskgroup/getTaskGroupList', admin, { caseId });
      expect(all.body.total).toBe(3);
      const pools = await post(h.app, '/api/taskgroup/getTaskGroupList', admin, {
        caseId,
        type: 3,
      });
      expect(pools.body.total).toBe(1);
      expect(pools.body.data[0]).toMatchObject({ type: 3, annotator: null, name: '人工标注池' });
      const byName = await post(h.app, '/api/taskgroup/getTaskGroupList', admin, {
        caseId,
        keyword: f.labeler1.username,
      });
      expect(byName.body.total).toBe(1);
      expect(byName.body.data[0].annotator).toBe(f.labeler1.username);
      expect(
        (await post(h.app, '/api/taskgroup/getTaskGroupList', admin, { type: 7 })).body.code,
      ).toBe('PARAM_INVALID');
    });

    it('getTaskListInGroup：组内排序（在手 → 待分配 → 完成）、bizId 已填；非 annotator 且非管理员 403', async () => {
      const groups = await selectGroups(h.ctx, caseId);
      const personal = groups.find((g) => g.type === TaskGroupType.PERSONAL)!;
      const pool = groups.find((g) => g.type === TaskGroupType.LABEL_POOL)!;
      const mine = await post(h.app, '/api/task/getTaskListInGroup', f.labeler1.token, {
        taskGroupId: personal.id,
      });
      expect(mine.body.total).toBe(2);
      expect(mine.body.data[0]).toMatchObject({
        status: 2,
        round: 1,
        bizId: 'biz-1',
        taskGroupSeq: 1,
      });
      expect(
        (
          await post(h.app, '/api/task/getTaskListInGroup', f.reviewer.token, {
            taskGroupId: personal.id,
          })
        ).status,
      ).toBe(403);
      // LABEL_ADMIN 可看池
      const poolList = await post(h.app, '/api/task/getTaskListInGroup', f.labelAdmin.token, {
        taskGroupId: pool.id,
        status: 1,
      });
      expect(poolList.body.total).toBe(1);
      expect(
        (
          await post(h.app, '/api/task/getTaskListInGroup', f.labeler1.token, {
            taskGroupId: 999999,
          })
        ).body.code,
      ).toBe('PARAM_INVALID');
    });

    it('getTaskDetail / getSampleData / getTaskResult：字段与空结果', async () => {
      const detail = await post(h.app, '/api/task/getTaskDetail', f.labeler1.token, { taskId });
      expect(detail.body.data).toMatchObject({
        taskId,
        caseId,
        taskType: 2,
        stageType: 'label',
        status: 2,
        round: 1,
        bizId: 'biz-1',
        annotator: f.labeler1.username,
        labelTool: { labelToolCode: f.toolCode, labelToolType: 1 },
      });
      expect(detail.body.data.claimTime).toBeGreaterThan(0);
      const sample = await post(h.app, '/api/task/getSampleData', f.labeler1.token, { taskId });
      expect(sample.body.data).toEqual({
        taskId,
        bizId: 'biz-1',
        sampleData: { text: '样本 1', bizId: 'biz-1' },
      });
      const result = await post(h.app, '/api/task/getTaskResult', f.labeler1.token, {
        taskId,
        sampleType: 1,
      });
      expect(result.body.data).toEqual({ taskId, sampleType: 1, hasResult: false, result: null });
      expect(
        (await post(h.app, '/api/task/getTaskResult', f.labeler1.token, { taskId, sampleType: 3 }))
          .body.code,
      ).toBe('SAMPLE_TYPE_INVALID');
      expect(
        (await post(h.app, '/api/task/getTaskDetail', f.labeler2.token, { taskId })).status,
      ).toBe(403);
      expect(
        (await post(h.app, '/api/task/getTaskDetail', f.labelAdmin.token, { taskId })).body.success,
      ).toBe(true);
      expect(
        (await post(h.app, '/api/task/getTaskDetail', f.labeler1.token, { taskId: 999999 })).body
          .code,
      ).toBe('TASK_NOT_FOUND');
    });

    it('saveTaskResult / submitLabelTask：非 annotator 403；未保存结果 → RESULT_SAMPLE_NOT_FOUND；review 类型不匹配', async () => {
      expect(
        (
          await post(h.app, '/api/task/saveTaskResult', f.labeler2.token, {
            taskId,
            sampleType: 1,
            result: { x: 1 },
          })
        ).status,
      ).toBe(403);
      expect(
        (await post(h.app, '/api/task/submitLabelTask', f.labeler1.token, { taskId })).body.code,
      ).toBe('RESULT_SAMPLE_NOT_FOUND');
      expect(
        (
          await post(h.app, '/api/task/saveTaskResult', f.labeler1.token, {
            taskId,
            sampleType: 2,
            result: {},
          })
        ).body.code,
      ).toBe('LABEL_RESULT_NOT_FOUND');
      expect(
        (
          await post(h.app, '/api/task/submitReviewTask', f.labeler1.token, {
            taskId,
            reviewAction: 1,
          })
        ).body.code,
      ).toBe('TASK_TYPE_INVALID');
      expect(
        (
          await post(h.app, '/api/task/submitReviewTask', f.labeler1.token, {
            taskId,
            reviewAction: 5,
          })
        ).body.code,
      ).toBe('REVIEW_ACTION_INVALID');
    });
  });

  describe('完整链路', () => {
    let caseId: number;
    let s1: number;
    let s2: number;
    let s3: number;

    beforeAll(async () => {
      [s1, s2, s3] = f.sampleIds as [number, number, number];
      caseId = await createCaseOk(
        h.app,
        f.labelAdmin.token,
        caseBody(f, {
          stages: ['label', 'review', 'recheck'],
          labelers: [f.labeler1.username, f.labeler2.username],
          reviewers: [f.reviewer.username],
          recheckers: [f.reviewer.username],
          preDispatchSize: 2,
        }),
      );
    });

    it('两名标注员各领 2 条（FCFS 顺序）；结果集 lazy 创建；提交后 task DONE、cost_time 有值、给提交者补题', async () => {
      const before = await selectTasks(h.ctx, caseId);
      const l1 = before.filter((t) => t.annotator === f.labeler1.username);
      const l2 = before.filter((t) => t.annotator === f.labeler2.username);
      expect(l1.map((t) => t.dataSampleId)).toEqual([s1, s2]);
      expect(l2.map((t) => t.dataSampleId)).toEqual([s3]);

      const t1 = l1[0]!;
      await labelAndSubmit(h.app, f.labeler1.token, t1.id, { label: 'A' });
      const done = await taskOf(caseId, TaskType.LABEL, s1);
      expect(done).toMatchObject({ status: TaskStatus.DONE, operator: f.labeler1.username });
      expect(done.costTime).toBeGreaterThanOrEqual(0);

      const caseRow = await h.ctx.db
        .selectFrom('label_case')
        .selectAll()
        .where('id', '=', caseId)
        .executeTakeFirstOrThrow();
      expect(caseRow.labelResultDatasetVersionId).not.toBeNull();
      const resultDs = await h.ctx.db
        .selectFrom('lingshu_dataset')
        .selectAll()
        .where('datasetName', '=', `结果集_case${caseId}`)
        .executeTakeFirstOrThrow();
      expect(resultDs).toMatchObject({ datasetType: 3, serviceObjName: f.toolCode });
      // 结果集不出现在数据集列表
      const list = await post(h.app, '/api/dataset/getDatasetList', f.labelAdmin.token, {
        spaceCode: f.spaceCode,
      });
      expect(list.body.data.some((d: { datasetId: number }) => d.datasetId === resultDs.id)).toBe(
        false,
      );
      // 池已空，补题拿不到；labeler1 在手 1 条
      const after = await selectTasks(h.ctx, caseId);
      expect(
        after.filter((t) => t.annotator === f.labeler1.username && t.status !== 4),
      ).toHaveLength(1);
      // 重复提交
      expect(
        (await post(h.app, '/api/task/submitLabelTask', f.labeler1.token, { taskId: t1.id })).body
          .code,
      ).toBe('TASK_ALREADY_COMPLETED');
      // 标注结果可读
      const result = await post(h.app, '/api/task/getTaskResult', f.labeler1.token, {
        taskId: t1.id,
        sampleType: 1,
      });
      expect(result.body.data).toMatchObject({ hasResult: true, result: { label: 'A' } });
    });

    it('task-completed 消费者：样本 1 进入 review 池并派给审核员（REVIEWING）', async () => {
      const r1 = await waitForTask(h.ctx, caseId, TaskType.FIRST_CHECK, s1, (t) => t.status === 3);
      expect(r1.annotator).toBe(f.reviewer.username);
      expect(r1.round).toBe(1);
      const detail = await post(h.app, '/api/case/getCaseDetail', f.labelAdmin.token, { caseId });
      expect(detail.body.data.stageProgress).toEqual([
        { stageType: 'label', taskType: 2, poolPending: 0, personalDoing: 2, done: 1 },
        { stageType: 'review', taskType: 4, poolPending: 0, personalDoing: 1, done: 0 },
        { stageType: 'recheck', taskType: 5, poolPending: 0, personalDoing: 0, done: 0 },
      ]);
    });

    it('审核驳回（原标注员 active）：标注 task 留组 REWORK round=2、claimTime 重置；质检结果可读；驳回不发 task-completed', async () => {
      const r1 = await taskOf(caseId, TaskType.FIRST_CHECK, s1);
      const labelBefore = await taskOf(caseId, TaskType.LABEL, s1);
      await new Promise((r) => setTimeout(r, 5));
      const res = await review(h.app, f.reviewer.token, r1.id, 0, '不对，重做');
      expect(res.body.success).toBe(true);
      const rejected = await taskOf(caseId, TaskType.LABEL, s1);
      expect(rejected).toMatchObject({
        status: TaskStatus.REWORK,
        round: 2,
        annotator: f.labeler1.username,
        taskGroupId: labelBefore.taskGroupId,
      });
      expect(rejected.claimTime).toBeGreaterThan(labelBefore.claimTime!);
      expect((await taskOf(caseId, TaskType.FIRST_CHECK, s1)).status).toBe(TaskStatus.DONE);
      // 标注员能看到质检意见
      const reviewResult = await post(h.app, '/api/task/getTaskResult', f.labeler1.token, {
        taskId: rejected.id,
        sampleType: 2,
      });
      expect(reviewResult.body.data.result).toEqual({
        reviewAction: 0,
        reviewComment: '不对，重做',
      });
      // recheck 阶段不应出现该样本
      await new Promise((r) => setTimeout(r, 500));
      expect(
        await h.ctx.db
          .selectFrom('label_task')
          .select('id')
          .where('caseId', '=', caseId)
          .where('taskType', '=', TaskType.RECHECK)
          .executeTakeFirst(),
      ).toBeUndefined();
    });

    it('重标提交后：review task 被重开（round=2、回池）并再次派给审核员 → 二轮质检通过 → 进入 recheck', async () => {
      const rework = await taskOf(caseId, TaskType.LABEL, s1);
      await labelAndSubmit(h.app, f.labeler1.token, rework.id, { label: 'A-fixed' });
      expect((await taskOf(caseId, TaskType.LABEL, s1)).status).toBe(TaskStatus.DONE);
      const r1b = await waitForTask(
        h.ctx,
        caseId,
        TaskType.FIRST_CHECK,
        s1,
        (t) => t.status === 3 && t.round === 2,
        'review reopened',
      );
      expect(r1b.annotator).toBe(f.reviewer.username);
      // 标注结果被覆盖
      const labelResult = await post(h.app, '/api/task/getTaskResult', f.reviewer.token, {
        taskId: r1b.id,
        sampleType: 1,
      });
      expect(labelResult.body.data.result).toEqual({ label: 'A-fixed' });

      const pass = await review(h.app, f.reviewer.token, r1b.id, 1, 'ok');
      expect(pass.body.success).toBe(true);
      const rc = await waitForTask(h.ctx, caseId, TaskType.RECHECK, s1, (t) => t.status === 3);
      expect(rc.annotator).toBe(f.reviewer.username);
      // 质检结果覆盖为通过
      const rr = await post(h.app, '/api/task/getTaskResult', f.reviewer.token, {
        taskId: rc.id,
        sampleType: 2,
      });
      expect(rr.body.data.result).toEqual({ reviewAction: 1, reviewComment: 'ok' });
    });

    it('复检通过（末阶段）：task DONE，无下一阶段；complete 消息 nextStageType 为 null 不报错', async () => {
      const rc = await taskOf(caseId, TaskType.RECHECK, s1);
      expect((await review(h.app, f.reviewer.token, rc.id, 1)).body.success).toBe(true);
      expect((await taskOf(caseId, TaskType.RECHECK, s1)).status).toBe(TaskStatus.DONE);
      await new Promise((r) => setTimeout(r, 300));
      const rows = await h.ctx.db
        .selectFrom('label_task')
        .select(({ fn }) => fn.countAll<number>().as('n'))
        .where('caseId', '=', caseId)
        .executeTakeFirstOrThrow();
      // 3 label + 1 review + 1 recheck
      expect(rows.n).toBe(5);
    });

    it('复检驳回 → 上一阶段是 review：review task REWORK 留在审核员组', async () => {
      // 让样本 3 走完 label → review 通过 → recheck
      const t3 = await taskOf(caseId, TaskType.LABEL, s3);
      await labelAndSubmit(h.app, f.labeler2.token, t3.id, { label: 'C' });
      const r3 = await waitForTask(h.ctx, caseId, TaskType.FIRST_CHECK, s3, (t) => t.status === 3);
      await review(h.app, f.reviewer.token, r3.id, 1);
      const rc3 = await waitForTask(h.ctx, caseId, TaskType.RECHECK, s3, (t) => t.status === 3);
      expect((await review(h.app, f.reviewer.token, rc3.id, 0, '复检不过')).body.success).toBe(
        true,
      );
      const r3b = await taskOf(caseId, TaskType.FIRST_CHECK, s3);
      expect(r3b).toMatchObject({
        status: TaskStatus.REWORK,
        round: 2,
        annotator: f.reviewer.username,
      });
      expect((await taskOf(caseId, TaskType.RECHECK, s3)).status).toBe(TaskStatus.DONE);
      // 审核员重做 review（REWORK 状态允许直接再次提交）
      expect((await review(h.app, f.reviewer.token, r3b.id, 1, '二次通过')).body.success).toBe(
        true,
      );
      const rc3b = await waitForTask(
        h.ctx,
        caseId,
        TaskType.RECHECK,
        s3,
        (t) => t.status === 3 && t.round === 2,
        'recheck reopened',
      );
      expect(rc3b.annotator).toBe(f.reviewer.username);
    });

    it('驳回时上一阶段无 task → REJECT_TARGET_NOT_FOUND；首阶段驳回 → PREVIOUS_STAGE_NOT_FOUND', async () => {
      // 首阶段 label 的 task 走 submitReviewTask 会先报 TASK_TYPE_INVALID，这里用 review task 验证 target 缺失：
      // 造一条独立 case 的 review task（无对应 label task）
      const { insertCase, insertPersonalGroup, insertTask } = await import('./helpers/seed.js');
      const cid = await insertCase(h.ctx, {
        spaceCode: f.spaceCode,
        name: `orphan ${Date.now()}`,
        labelToolCode: f.toolCode,
      });
      await h.ctx.db
        .updateTable('label_case')
        .set({
          taskPlanConfig: JSON.stringify({
            stages: [
              { stage: 2, type: 'label' },
              { stage: 4, type: 'review' },
            ],
          }),
        })
        .where('id', '=', cid)
        .execute();
      const gid = await insertPersonalGroup(h.ctx, {
        caseId: cid,
        stage: 4,
        annotator: f.reviewer.username,
      });
      const tid = await insertTask(h.ctx, {
        caseId: cid,
        taskGroupId: gid,
        taskType: 4,
        status: 3,
        dataSampleId: s2,
        annotator: f.reviewer.username,
        claimTime: Date.now(),
      });
      expect((await review(h.app, f.reviewer.token, tid, 0)).body.code).toBe(
        'REJECT_TARGET_NOT_FOUND',
      );
      // 只有 review 一阶段的 plan：无上一阶段
      await h.ctx.db
        .updateTable('label_case')
        .set({ taskPlanConfig: JSON.stringify({ stages: [{ stage: 4, type: 'review' }] }) })
        .where('id', '=', cid)
        .execute();
      expect((await review(h.app, f.reviewer.token, tid, 0)).body.code).toBe(
        'PREVIOUS_STAGE_NOT_FOUND',
      );
    });
  });

  describe('驳回时原标注员已 inactive → 回池并派给其他 active 成员', () => {
    it('回池后 status=5 round=2 清 annotator，随后被 labeler2 领走且保持 REWORK', async () => {
      const f2 = await createFixture(h.ctx, h.app, 1);
      const caseId = await createCaseOk(
        h.app,
        f2.labelAdmin.token,
        caseBody(f2, {
          stages: ['label', 'review'],
          labelers: [f2.labeler1.username, f2.labeler2.username],
          preDispatchSize: 1,
        }),
      );
      const sid = f2.sampleIds[0]!;
      const t = await taskOf(caseId, TaskType.LABEL, sid);
      expect(t.annotator).toBe(f2.labeler1.username);
      await labelAndSubmit(h.app, f2.labeler1.token, t.id);
      const r = await waitForTask(h.ctx, caseId, TaskType.FIRST_CHECK, sid, (x) => x.status === 3);
      // 把 labeler1 标为 inactive
      await h.ctx.db
        .updateTable('label_case')
        .set({
          assignmentConfig: JSON.stringify({
            label: {
              strategy: 1,
              preDispatchSize: 1,
              autoRecycleMinutes: null,
              members: [
                { username: f2.labeler1.username, ratio: null, active: false },
                { username: f2.labeler2.username, ratio: null, active: true },
              ],
            },
            review: {
              strategy: 1,
              preDispatchSize: 1,
              autoRecycleMinutes: null,
              members: [{ username: f2.reviewer.username, ratio: null, active: true }],
            },
          }),
        })
        .where('id', '=', caseId)
        .execute();
      expect((await review(h.app, f2.reviewer.token, r.id, 0, 'no')).body.success).toBe(true);
      // 提交后 dispatchPool(prevStage) 立即把回池的 task 派给 labeler2
      const re = await waitFor(
        () => taskOf(caseId, TaskType.LABEL, sid),
        (x) => x.annotator === f2.labeler2.username,
        5_000,
        'redispatched to labeler2',
      );
      expect(re).toMatchObject({ status: TaskStatus.REWORK, round: 2 });
      expect(re.claimTime).not.toBeNull();
      // labeler1 在手为 0
      const groups = await selectGroups(h.ctx, caseId);
      const g1 = groups.find((g) => g.annotator === f2.labeler1.username)!;
      const inHand = await post(h.app, '/api/task/getTaskListInGroup', f2.labeler1.token, {
        taskGroupId: g1.id,
        status: 5,
      });
      expect(inHand.body.total).toBe(0);
    });
  });
});
