import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TaskStatus, TaskGroupType } from '../src/modules/task/enums.js';
import { uniq } from './helpers/app.js';
import {
  caseBody,
  createCaseOk,
  createFixture,
  createPipelineHarness,
  post,
  selectGroups,
  selectTasks,
  type Fixture,
  type PipelineHarness,
} from './helpers/pipeline.js';

describe('/api/case', () => {
  let h: PipelineHarness;
  let f: Fixture;

  beforeAll(async () => {
    h = await createPipelineHarness();
    f = await createFixture(h.ctx, h.app, 5);
  });
  afterAll(() => h.close());

  const create = (token: string, body: object) => post(h.app, '/api/case/createCase', token, body);
  const codeOf = async (token: string, body: object) => (await create(token, body)).body.code;

  describe('POST /createCase 校验', () => {
    it('边界：dataSourceType / stages / stage.type / assignmentConfig / strategy 非法', async () => {
      expect(await codeOf(f.labelAdmin.token, { ...caseBody(f), dataSourceType: 9 })).toBe(
        'DATA_SOURCE_TYPE_INVALID',
      );
      expect(await codeOf(f.labelAdmin.token, { ...caseBody(f), taskPlanConfig: {} })).toBe(
        'TASK_PLAN_INVALID',
      );
      expect(
        await codeOf(f.labelAdmin.token, {
          ...caseBody(f),
          taskPlanConfig: { stages: [{ stage: 1, type: 'nope' }] },
        }),
      ).toBe('STAGE_TYPE_INVALID');
      expect(await codeOf(f.labelAdmin.token, { ...caseBody(f), assignmentConfig: null })).toBe(
        'STAGE_CONFIG_MISSING',
      );
      expect(await codeOf(f.labelAdmin.token, caseBody(f, { strategy: 7 }))).toBe(
        'STRATEGY_INVALID',
      );
    });

    it('空间不存在 → WORKSPACE_NOT_FOUND；LABELER / 外空间 → 403；STREAM → DATA_SOURCE_TYPE_INVALID', async () => {
      expect(await codeOf(f.labelAdmin.token, { ...caseBody(f), spaceCode: 'nope' })).toBe(
        'WORKSPACE_NOT_FOUND',
      );
      expect((await create(f.labeler1.token, caseBody(f))).status).toBe(403);
      const res = await create(f.labelAdmin.token, { ...caseBody(f), dataSourceType: 2 });
      expect(res.body).toMatchObject({
        code: 'DATA_SOURCE_TYPE_INVALID',
        message: '流式模式暂不支持',
      });
    });

    it('基础参数：name / description / labelTool / datasetVersionId / 版本状态 / 工具存在', async () => {
      const t = f.labelAdmin.token;
      expect(await codeOf(t, { ...caseBody(f), name: '  ' })).toBe('CASE_NAME_INVALID');
      expect(await codeOf(t, { ...caseBody(f), name: 'x'.repeat(256) })).toBe('CASE_NAME_INVALID');
      expect(await codeOf(t, { ...caseBody(f), description: 'd'.repeat(1025) })).toBe(
        'DESCRIPTION_TOO_LONG',
      );
      expect(await codeOf(t, { ...caseBody(f), labelTool: '' })).toBe('LABEL_TOOL_REQUIRED');
      expect(await codeOf(t, { ...caseBody(f), datasetVersionId: null })).toBe(
        'DATASET_VERSION_REQUIRED',
      );
      expect(await codeOf(t, { ...caseBody(f), datasetVersionId: 999999 })).toBe(
        'DATASET_VERSION_NOT_FOUND',
      );
      expect(await codeOf(t, { ...caseBody(f), labelTool: 'no-such-tool' })).toBe(
        'LABEL_TOOL_NOT_FOUND',
      );
    });

    it('流程编排：重复 / 顺序 / 至少 aiPreLabel 或 label；缺 stage 配置', async () => {
      const t = f.labelAdmin.token;
      const withStages = (types: string[]) => ({
        ...caseBody(f),
        taskPlanConfig: { stages: types.map((type) => ({ stage: 0, type })) },
      });
      expect((await create(t, withStages(['label', 'label']))).body.message).toContain(
        'stage 类型不可重复',
      );
      expect((await create(t, withStages(['review', 'label']))).body.message).toContain(
        'stage 顺序',
      );
      expect((await create(t, withStages(['review']))).body.message).toContain(
        '至少包含 aiPreLabel 或 label',
      );
      const missing = await create(t, {
        ...caseBody(f, { stages: ['label', 'review'] }),
        assignmentConfig: { label: caseBody(f).assignmentConfig['label'] },
      });
      expect(missing.body).toMatchObject({
        code: 'STAGE_CONFIG_MISSING',
        message: '缺少 review 配置',
      });
    });

    it('AI 阶段：aiCode 必填、preDispatchSize ≥ 1、配置存在、工具一致', async () => {
      const t = f.labelAdmin.token;
      const body = caseBody(f, { stages: ['aiPreLabel', 'label'] });
      const withAi = (patch: Record<string, unknown>) => ({
        ...body,
        assignmentConfig: {
          ...body.assignmentConfig,
          aiPreLabel: { ...(body.assignmentConfig['aiPreLabel'] as object), ...patch },
        },
      });
      expect(await codeOf(t, withAi({ aiCode: ' ' }))).toBe('AI_CODE_REQUIRED');
      expect(await codeOf(t, withAi({ preDispatchSize: 0 }))).toBe('PRE_DISPATCH_SIZE_INVALID');
      expect(await codeOf(t, withAi({ aiCode: 'no-such-ai' }))).toBe('AI_CONFIG_NOT_FOUND');
      // 另一工具的 AI 配置
      const otherTool = uniq('ot');
      const { createLabelToolRow } = await import('./helpers/app.js');
      await createLabelToolRow(h.ctx, { labelToolCode: otherTool });
      const { upsertAiConfig } = await import('./helpers/pipeline.js');
      const otherAi = await upsertAiConfig(h.ctx, otherTool);
      expect(await codeOf(t, withAi({ aiCode: otherAi }))).toBe('AI_CONFIG_LABEL_TOOL_MISMATCH');
    });

    it('人工阶段：成员必填、不在空间、角色不符、FCFS ratio 必须 null、FIXED_RATIO 之和 100', async () => {
      const t = f.labelAdmin.token;
      expect(await codeOf(t, caseBody(f, { labelers: [] }))).toBe('STAGE_MEMBERS_REQUIRED');
      expect(await codeOf(t, caseBody(f, { labelers: ['ghost-user'] }))).toBe(
        'MEMBER_NOT_IN_WORKSPACE',
      );
      // outsider 在空间里但只有 REVIEWER 角色
      expect(await codeOf(t, caseBody(f, { labelers: [f.outsider.username] }))).toBe(
        'MEMBER_ROLE_MISMATCH',
      );
      expect(await codeOf(t, caseBody(f, { reviewers: [f.labeler1.username] }))).toBe(
        'MEMBER_ROLE_MISMATCH',
      );
      expect(
        await codeOf(t, caseBody(f, { ratios: { [f.labeler1.username]: 50 }, strategy: 1 })),
      ).toBe('RATIO_INVALID');
      expect(
        await codeOf(
          t,
          caseBody(f, {
            strategy: 2,
            labelers: [f.labeler1.username, f.labeler2.username],
            ratios: { [f.labeler1.username]: 60, [f.labeler2.username]: 60 },
          }),
        ),
      ).toBe('RATIO_INVALID');
      expect(
        await codeOf(t, caseBody(f, { strategy: 2, ratios: { [f.labeler1.username]: 50 } })),
      ).toBe('RATIO_INVALID');
      expect(
        await codeOf(
          t,
          caseBody(f, {
            strategy: 2,
            ratios: { [f.labeler1.username]: 100 },
            inactive: [f.labeler1.username],
          }),
        ),
      ).toBe('STAGE_MEMBERS_REQUIRED');
    });

    it('同名（大小写不敏感）→ CASE_NAME_EXISTS', async () => {
      const name = `Dup ${uniq('n')}`;
      await createCaseOk(h.app, f.labelAdmin.token, caseBody(f, { name }));
      expect(await codeOf(f.labelAdmin.token, caseBody(f, { name: name.toUpperCase() }))).toBe(
        'CASE_NAME_EXISTS',
      );
    });
  });

  describe('POST /createCase 落库与首批派发', () => {
    it('label→review：case RUNNING、两个池、5 条 task 入标注池、预派 3 条给标注员（bizId 已填）', async () => {
      const caseId = await createCaseOk(h.app, f.labelAdmin.token, caseBody(f));
      const groups = await selectGroups(h.ctx, caseId);
      expect(groups.map((g) => g.type).sort()).toEqual([
        TaskGroupType.PERSONAL,
        TaskGroupType.LABEL_POOL,
        TaskGroupType.REVIEW_POOL,
      ]);
      const pool = groups.find((g) => g.type === TaskGroupType.LABEL_POOL)!;
      expect(pool).toMatchObject({ name: '人工标注池', totalCount: 5, status: 1, annotator: null });
      const personal = groups.find((g) => g.type === TaskGroupType.PERSONAL)!;
      expect(personal).toMatchObject({
        stage: 2,
        annotator: f.labeler1.username,
        status: 2,
        labelToolCode: f.toolCode,
      });
      expect(personal.name).toContain(`-${f.labeler1.username}-label`);

      const tasks = await selectTasks(h.ctx, caseId);
      expect(tasks).toHaveLength(5);
      const inHand = tasks.filter((t) => t.taskGroupId === personal.id);
      expect(inHand).toHaveLength(3);
      expect(inHand.every((t) => t.status === TaskStatus.LABELING && t.claimTime !== null)).toBe(
        true,
      );
      expect(inHand.map((t) => t.taskGroupSeq).sort()).toEqual([1, 2, 3]);
      expect(tasks.filter((t) => t.taskGroupId === pool.id)).toHaveLength(2);
      expect(tasks.map((t) => t.bizId).sort()).toEqual([
        'biz-1',
        'biz-2',
        'biz-3',
        'biz-4',
        'biz-5',
      ]);
      // 派发消息已入队（outbox 已清空）
      const pending = await h.ctx.db.selectFrom('mq_outbox').selectAll().execute();
      expect(pending).toHaveLength(0);
    });

    it('FIXED_RATIO：按配额封顶（5 条 × 40% = 2 条），另一人拿 3 条', async () => {
      const caseId = await createCaseOk(
        h.app,
        f.labelAdmin.token,
        caseBody(f, {
          strategy: 2,
          labelers: [f.labeler1.username, f.labeler2.username],
          ratios: { [f.labeler1.username]: 40, [f.labeler2.username]: 60 },
          preDispatchSize: 5,
        }),
      );
      const tasks = await selectTasks(h.ctx, caseId);
      expect(tasks.filter((t) => t.annotator === f.labeler1.username)).toHaveLength(2);
      expect(tasks.filter((t) => t.annotator === f.labeler2.username)).toHaveLength(3);
    });
  });

  describe('列表 / 详情 / 导出触发', () => {
    let caseId: number;
    beforeAll(async () => {
      caseId = await createCaseOk(
        h.app,
        f.labelAdmin.token,
        caseBody(f, { name: `列表用例 ${uniq('l')}` }),
      );
    });

    it('getCaseList：空间成员可看、非成员 403、status 非法 PARAM_INVALID、keyword 过滤', async () => {
      const ok = await post(h.app, '/api/case/getCaseList', f.labeler1.token, {
        spaceCode: f.spaceCode,
        keyword: '列表用例',
      });
      expect(ok.body.success).toBe(true);
      expect(ok.body.total).toBeGreaterThanOrEqual(1);
      expect(ok.body.data[0]).toMatchObject({
        dataSourceType: 1,
        status: 2,
        labelToolCode: f.toolCode,
        creator: f.labelAdmin.username,
      });
      const stranger = await import('./helpers/app.js').then((m) =>
        m.createUserAndLogin(h.ctx, h.app, 'pls'),
      );
      expect(
        (
          await post(h.app, '/api/case/getCaseList', stranger.token, {
            spaceCode: f.spaceCode,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await post(h.app, '/api/case/getCaseList', f.labeler1.token, {
            spaceCode: f.spaceCode,
            status: 9,
          })
        ).body.code,
      ).toBe('PARAM_INVALID');
    });

    it('getCaseDetail：配置透传 + stageProgress（label: 3 在做 / 2 池待领；review: 0）', async () => {
      const res = await post(h.app, '/api/case/getCaseDetail', f.reviewer.token, { caseId });
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        caseId,
        spaceCode: f.spaceCode,
        status: 2,
        labelResultDatasetVersionId: null,
        taskPlanConfig: {
          stages: [
            { stage: 2, type: 'label' },
            { stage: 4, type: 'review' },
          ],
        },
        stageProgress: [
          { stageType: 'label', taskType: 2, poolPending: 2, personalDoing: 3, done: 0 },
          { stageType: 'review', taskType: 4, poolPending: 0, personalDoing: 0, done: 0 },
        ],
        ext: null,
      });
      expect(res.body.data.assignmentConfig.label.members[0].username).toBe(f.labeler1.username);
      expect(
        (await post(h.app, '/api/case/getCaseDetail', f.labeler1.token, { caseId: 999999 })).body
          .code,
      ).toBe('CASE_NOT_FOUND');
    });

    it('exportCaseResult：格式非法 / 权限 / 写 EXPORTING 并入队', async () => {
      expect(
        (
          await post(h.app, '/api/case/exportCaseResult', f.labelAdmin.token, {
            caseId,
            format: 'xml',
          })
        ).body.code,
      ).toBe('EXPORT_FORMAT_INVALID');
      expect(
        (
          await post(h.app, '/api/case/exportCaseResult', f.labeler1.token, {
            caseId,
            format: 'csv',
          })
        ).status,
      ).toBe(403);
      const res = await post(h.app, '/api/case/exportCaseResult', f.labelAdmin.token, {
        caseId,
        format: 'CSV',
      });
      expect(res.body.success).toBe(true);
      const detail = await post(h.app, '/api/case/getCaseDetail', f.labelAdmin.token, { caseId });
      expect(detail.body.data.ext.lastExport).toMatchObject({ status: 'EXPORTING', format: 'csv' });
      expect(detail.body.data.ext.lastExport.triggerTime).toBeGreaterThan(0);
      const jobs = await h.ctx.queues.caseExport.getJobs(['waiting', 'delayed', 'active']);
      expect(jobs.some((j) => j.data.caseId === caseId)).toBe(true);
    });
  });
});
