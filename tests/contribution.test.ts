import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TaskStatus, TaskType } from '../src/modules/task/enums.js';
import { WorkspaceRole } from '../src/modules/workspace/enums.js';
import {
  addMember,
  adminToken,
  bearer,
  createTestHarness,
  createUserAndLogin,
  createWorkspace,
  uniq,
  type LoggedInUser,
  type TestHarness,
} from './helpers/app.js';
import { insertCase, insertPersonalGroup, insertSample, insertTask } from './helpers/seed.js';

const DAY = 86_400_000;

/** 与后端一致的按天口径：Asia/Shanghai。 */
function dayOf(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

describe('POST /api/user/getMyContribution', () => {
  let h: TestHarness;
  let admin: string;
  let target: LoggedInUser;
  let labelAdmin: LoggedInUser;
  let outsider: LoggedInUser;
  let wsId: number;
  let wsCode: string;

  beforeAll(async () => {
    h = await createTestHarness();
    admin = await adminToken(h.app);
    target = await createUserAndLogin(h.ctx, h.app, 'ctg', { displayName: '贡献目标' });
    labelAdmin = await createUserAndLogin(h.ctx, h.app, 'cla');
    outsider = await createUserAndLogin(h.ctx, h.app, 'cout');
    wsCode = uniq('cws');
    wsId = await createWorkspace(h.ctx, { spaceCode: wsCode, name: '贡献空间' });
    await addMember(h.ctx, wsId, target.userId, WorkspaceRole.REVIEWER);
    await addMember(h.ctx, wsId, target.userId, WorkspaceRole.LABELER);
    await addMember(h.ctx, wsId, labelAdmin.userId, WorkspaceRole.LABEL_ADMIN);
    const other = await createWorkspace(h.ctx, { spaceCode: uniq('cot'), name: '别的空间' });
    await addMember(h.ctx, other, outsider.userId, WorkspaceRole.LABEL_ADMIN);
  });
  afterAll(() => h.close());

  const post = (token: string, body: object) =>
    request(h.app)
      .post('/api/user/getMyContribution')
      .set('Authorization', bearer(token))
      .send(body);

  it('权限：本人 / 系统管理员 / 目标所在空间的 LABEL_ADMIN 放行；其他空间的 LABEL_ADMIN → 403', async () => {
    for (const token of [target.token, admin, labelAdmin.token]) {
      const res = await post(token, { username: target.username });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }
    const denied = await post(outsider.token, { username: target.username });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
  });

  it('username 空白 → INVALID_PARAM；不存在 → USER_INVALID（先于权限）', async () => {
    expect((await post(target.token, { username: ' ' })).body).toMatchObject({
      code: 'INVALID_PARAM',
      message: 'username 不能为空',
    });
    expect((await post(outsider.token, { username: uniq('ghost') })).body.code).toBe(
      'USER_INVALID',
    );
  });

  it('从未做过任务：计数为 0、无分母字段为 null、last30Days 为空；user / workspaces 段完整', async () => {
    const res = await post(target.token, { username: target.username.toUpperCase() });
    expect(res.body.data).toEqual({
      user: {
        userId: target.userId,
        username: target.username,
        displayName: '贡献目标',
        status: 0,
        isSystemAdmin: false,
        createTime: expect.any(Number),
      },
      workspaces: [
        { workspaceId: wsId, spaceCode: wsCode, name: '贡献空间', roles: ['LABELER', 'REVIEWER'] },
      ],
      overview: {
        totalDoneCount: 0,
        inHandCount: 0,
        caseCount: 0,
        labelToolCount: 0,
        lastActiveTime: null,
      },
      labeler: {
        doneCount: 0,
        inHandCount: 0,
        reboundCount: 0,
        submissionCount: 0,
        avgCostMillis: null,
        reviewedCount: 0,
        passCount: 0,
        passRate: null,
      },
      reviewer: {
        doneCountReview: 0,
        doneCountRecheck: 0,
        doneCountTotal: 0,
        inHandCount: 0,
        avgCostMillis: null,
        reviewedCount: 0,
        passCount: 0,
        passRate: null,
      },
      last30Days: [],
    });
  });

  it('统计口径：完成 / 在手 / 打回 / 提交次数 / 平均耗时 / 通过率 / 近 30 天按天', async () => {
    const annotator = target.username;
    const now = Date.now();
    const resultVersionId = 900_000 + Math.floor(Math.random() * 100_000);
    const caseId = await insertCase(h.ctx, {
      spaceCode: wsCode,
      name: uniq('case'),
      labelToolCode: 'tool-x',
      labelResultDatasetVersionId: resultVersionId,
    });
    const labelGroup = await insertPersonalGroup(h.ctx, { caseId, stage: 2, annotator });
    const reviewGroup = await insertPersonalGroup(h.ctx, { caseId, stage: 4, annotator });

    // 结果样本链：标注结果 biz_id = String(源 sampleId)；质检结果 biz_id = String(标注结果 sample.id)
    const ls1 = await insertSample(h.ctx, {
      datasetVersionId: resultVersionId,
      bizId: '101',
      sampleData: { label: 'A' },
    });
    await insertSample(h.ctx, {
      datasetVersionId: resultVersionId,
      bizId: String(ls1),
      sampleData: { reviewAction: 1, reviewComment: 'ok' },
    });
    const ls2 = await insertSample(h.ctx, {
      datasetVersionId: resultVersionId,
      bizId: '102',
      sampleData: { label: 'B' },
    });
    await insertSample(h.ctx, {
      datasetVersionId: resultVersionId,
      bizId: String(ls2),
      sampleData: { reviewAction: 0, reviewComment: 'bad' },
    });
    await insertSample(h.ctx, {
      datasetVersionId: resultVersionId,
      bizId: '103',
      sampleData: { label: 'C' },
    });

    const base = { caseId, annotator };
    const label = (o: Partial<Parameters<typeof insertTask>[1]>) =>
      insertTask(h.ctx, {
        ...base,
        taskGroupId: labelGroup,
        taskType: TaskType.LABEL,
        status: TaskStatus.DONE,
        dataSampleId: 0,
        ...o,
      });
    const review = (o: Partial<Parameters<typeof insertTask>[1]>) =>
      insertTask(h.ctx, {
        ...base,
        taskGroupId: reviewGroup,
        taskType: TaskType.FIRST_CHECK,
        status: TaskStatus.DONE,
        dataSampleId: 0,
        ...o,
      });

    await label({ dataSampleId: 101, costTime: 1000, updateTime: now - DAY });
    await label({ dataSampleId: 102, costTime: 3000, round: 2, updateTime: now });
    await label({ dataSampleId: 103, status: TaskStatus.REWORK, round: 2, updateTime: now });
    await label({ dataSampleId: 104, status: TaskStatus.LABELING, updateTime: now });
    await label({ dataSampleId: 105, costTime: 2000, updateTime: now - 40 * DAY });
    await review({ dataSampleId: 101, costTime: 2000, updateTime: now });
    await review({
      dataSampleId: 102,
      taskType: TaskType.RECHECK,
      costTime: 4000,
      updateTime: now,
    });
    await review({ dataSampleId: 103, status: TaskStatus.REVIEWING, updateTime: now });
    // 他人的任务不计入
    await insertTask(h.ctx, {
      caseId,
      taskGroupId: labelGroup,
      taskType: TaskType.LABEL,
      status: TaskStatus.DONE,
      dataSampleId: 106,
      annotator: outsider.username,
      costTime: 99,
    });

    const res = await post(admin, { username: annotator });
    expect(res.body.success, JSON.stringify(res.body)).toBe(true);
    const { overview, labeler, reviewer, last30Days } = res.body.data;
    expect(overview).toEqual({
      totalDoneCount: 5,
      inHandCount: 3,
      caseCount: 1,
      labelToolCount: 1,
      lastActiveTime: now,
    });
    expect(labeler).toEqual({
      doneCount: 3,
      inHandCount: 2,
      reboundCount: 2,
      submissionCount: 4,
      avgCostMillis: 2000,
      reviewedCount: 2,
      passCount: 1,
      passRate: 0.5,
    });
    expect(reviewer).toEqual({
      doneCountReview: 1,
      doneCountRecheck: 1,
      doneCountTotal: 2,
      inHandCount: 1,
      avgCostMillis: 3000,
      reviewedCount: 2,
      passCount: 1,
      passRate: 0.5,
    });
    expect(last30Days).toEqual([
      { date: dayOf(now - DAY), count: 1 },
      { date: dayOf(now), count: 3 },
    ]);
  });
});
