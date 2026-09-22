// M5 功能补齐：case 状态控制（暂停 / 恢复 / 结束 + 自动结束）、站内通知（派发 / 驳回 / 结束 / 截止）、
// 截止时间（设置 / 校验 / 扫描提醒与逾期）、个人组 status / doneCount 重算。消费者在本进程内启动。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CaseStatus, TaskGroupStatus, TaskStatus, TaskType } from '../src/modules/task/enums.js';
import { DEADLINE_REMINDER_AHEAD_MS } from '../src/modules/task/case.service.js';
import { startDeadlineScheduler } from '../src/modules/task/task.workers.js';
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

describe('M5 · case 状态 / 通知 / 截止 / 个人组统计', () => {
  let h: PipelineHarness;
  let f: Fixture;

  beforeAll(async () => {
    h = await createPipelineHarness();
    await h.startWorkers();
    f = await createFixture(h.ctx, h.app, 3);
  });
  afterAll(() => h.close());

  const caseRow = (caseId: number) =>
    h.ctx.db
      .selectFrom('label_case')
      .selectAll()
      .where('id', '=', caseId)
      .executeTakeFirstOrThrow();
  const notifications = (username: string) =>
    h.ctx.db
      .selectFrom('sys_notification')
      .selectAll()
      .where('username', '=', username)
      .orderBy('id', 'desc')
      .execute();
  const setStatus = (token: string, caseId: number, status: number) =>
    post(h.app, '/api/case/updateCaseStatus', token, { caseId, status });

  describe('updateCaseStatus', () => {
    it('权限 / 参数：非管理 403、status 非法、case 不存在', async () => {
      const caseId = await createCaseOk(h.app, f.labelAdmin.token, caseBody(f));
      expect((await setStatus(f.labeler1.token, caseId, 3)).status).toBe(403);
      expect((await setStatus(f.labelAdmin.token, caseId, 1)).body.code).toBe(
        'CASE_STATUS_INVALID',
      );
      expect((await setStatus(f.labelAdmin.token, caseId, 9)).body.code).toBe(
        'CASE_STATUS_INVALID',
      );
      expect((await setStatus(f.labelAdmin.token, 999999999, 3)).body.code).toBe('CASE_NOT_FOUND');
    });

    it('暂停：不再派发，在手任务仍可提交；恢复：补派；结束：拒绝保存 / 提交；终态不可逆', async () => {
      const caseId = await createCaseOk(
        h.app,
        f.labelAdmin.token,
        caseBody(f, { preDispatchSize: 1 }),
      );
      const first = (await selectTasks(h.ctx, caseId)).find(
        (t) => t.status === TaskStatus.LABELING,
      )!;
      // 暂停
      const paused = await setStatus(f.labelAdmin.token, caseId, CaseStatus.PAUSED);
      expect(paused.body).toMatchObject({ success: true, data: { caseId, status: 3 } });
      expect((await caseRow(caseId)).status).toBe(CaseStatus.PAUSED);
      expect((await setStatus(f.labelAdmin.token, caseId, CaseStatus.PAUSED)).body.success).toBe(
        true,
      ); // 幂等
      // 在手任务提交成功，但提交后的补题不派新题（池内 2 条仍待分配）
      await labelAndSubmit(h.app, f.labeler1.token, first.id);
      await waitForTask(
        h.ctx,
        caseId,
        TaskType.FIRST_CHECK,
        first.dataSampleId,
        (t) => t.status === TaskStatus.PENDING_DISPATCH,
      );
      let tasks = await selectTasks(h.ctx, caseId);
      expect(tasks.filter((t) => t.taskType === TaskType.LABEL && t.status === 2)).toHaveLength(0);
      expect(tasks.filter((t) => t.taskType === TaskType.LABEL && t.status === 1)).toHaveLength(2);
      // 详情 / 列表状态
      const detail = await post(h.app, '/api/case/getCaseDetail', f.labelAdmin.token, { caseId });
      expect(detail.body.data.status).toBe(3);
      // 恢复 → 标注池补派 1 条、初检池派 1 条
      const resumed = await setStatus(f.labelAdmin.token, caseId, CaseStatus.RUNNING);
      expect(resumed.body.data.status).toBe(2);
      await waitFor(
        () => selectTasks(h.ctx, caseId),
        (ts) =>
          ts.some((t) => t.taskType === TaskType.LABEL && t.status === 2) &&
          ts.some((t) => t.taskType === TaskType.FIRST_CHECK && t.status === 3),
        10_000,
        'redispatch after resume',
      );
      // 结束
      expect(
        (await setStatus(f.labelAdmin.token, caseId, CaseStatus.FINISHED)).body.data.status,
      ).toBe(4);
      tasks = await selectTasks(h.ctx, caseId);
      const inHand = tasks.find((t) => t.taskType === TaskType.LABEL && t.status === 2)!;
      const save = await post(h.app, '/api/task/saveTaskResult', f.labeler1.token, {
        taskId: inHand.id,
        sampleType: 1,
        result: { label: 'x' },
      });
      expect(save.body.code).toBe('CASE_FINISHED');
      const submit = await post(h.app, '/api/task/submitLabelTask', f.labeler1.token, {
        taskId: inHand.id,
      });
      expect(submit.body.code).toBe('CASE_FINISHED');
      expect((await setStatus(f.labelAdmin.token, caseId, CaseStatus.RUNNING)).body.code).toBe(
        'CASE_STATUS_TRANSITION_INVALID',
      );
      expect((await setStatus(f.labelAdmin.token, caseId, CaseStatus.PAUSED)).body.code).toBe(
        'CASE_STATUS_TRANSITION_INVALID',
      );
    });

    it('自动结束：全部样本走完末阶段 → FINISHED 并通知创建人；中间阶段完成不误判', async () => {
      const caseId = await createCaseOk(h.app, f.labelAdmin.token, caseBody(f));
      const labels = (await selectTasks(h.ctx, caseId)).filter(
        (t) => t.taskType === TaskType.LABEL,
      );
      expect(labels).toHaveLength(3);
      for (const t of labels) await labelAndSubmit(h.app, f.labeler1.token, t.id);
      // 标注全完成后 case 仍 RUNNING（初检未完成）
      for (const t of labels) {
        await waitForTask(
          h.ctx,
          caseId,
          TaskType.FIRST_CHECK,
          t.dataSampleId,
          (r) => r.status === TaskStatus.REVIEWING,
        );
      }
      expect((await caseRow(caseId)).status).toBe(CaseStatus.RUNNING);
      const reviews = (await selectTasks(h.ctx, caseId)).filter(
        (t) => t.taskType === TaskType.FIRST_CHECK,
      );
      // 第一条驳回再通过：驳回时 target 变 REWORK，不会误判结束
      expect((await review(h.app, f.reviewer.token, reviews[0]!.id, 0, '重做')).body.success).toBe(
        true,
      );
      expect((await caseRow(caseId)).status).toBe(CaseStatus.RUNNING);
      await labelAndSubmit(h.app, f.labeler1.token, labels[0]!.id, { label: 'v2' });
      const reopened = await waitForTask(
        h.ctx,
        caseId,
        TaskType.FIRST_CHECK,
        labels[0]!.dataSampleId,
        (r) => r.status === TaskStatus.REVIEWING && r.round === 2,
      );
      for (const r of [reopened, reviews[1]!, reviews[2]!]) {
        expect((await review(h.app, f.reviewer.token, r.id, 1)).body.success).toBe(true);
      }
      await waitFor(
        () => caseRow(caseId),
        (c) => c.status === CaseStatus.FINISHED,
        10_000,
        'case auto finished',
      );
      const row = await caseRow(caseId);
      expect(row.operator).toBe('SYSTEM');
      const mine = await notifications(f.labelAdmin.username);
      const done = mine.find((n) => n.type === 'CASE_FINISHED' && n.refId === caseId);
      expect(done).toBeTruthy();
      expect(done!.refType).toBe('CASE');
    });
  });

  describe('个人组 status / doneCount', () => {
    it('派发后 RUNNING + totalCount；全部完成后 DONE；驳回留组后回到 RUNNING', async () => {
      const caseId = await createCaseOk(
        h.app,
        f.labelAdmin.token,
        caseBody(f, { preDispatchSize: 3 }),
      );
      const personal = () =>
        selectGroups(h.ctx, caseId).then((gs) =>
          gs.find((g) => g.type === 1 && g.stage === TaskType.LABEL),
        );
      let g = (await personal())!;
      expect(g).toMatchObject({ status: TaskGroupStatus.RUNNING, totalCount: 3, doneCount: 0 });
      const labels = (await selectTasks(h.ctx, caseId)).filter(
        (t) => t.taskType === TaskType.LABEL,
      );
      for (const t of labels) await labelAndSubmit(h.app, f.labeler1.token, t.id);
      g = (await personal())!;
      expect(g).toMatchObject({ status: TaskGroupStatus.DONE, totalCount: 3, doneCount: 3 });
      // 我的任务组接口也能看到 DONE
      const mine = await post(h.app, '/api/taskgroup/getMyTaskGroups', f.labeler1.token, {
        spaceCode: f.spaceCode,
        pageSize: 100,
      });
      expect(mine.body.data.find((x: { caseId: number }) => x.caseId === caseId).status).toBe(3);
      // 驳回一条 → 留组 REWORK → 组回到 RUNNING，done 2/3
      const rv = await waitForTask(
        h.ctx,
        caseId,
        TaskType.FIRST_CHECK,
        labels[0]!.dataSampleId,
        (r) => r.status === TaskStatus.REVIEWING,
      );
      await review(h.app, f.reviewer.token, rv.id, 0, '不行');
      g = (await personal())!;
      expect(g).toMatchObject({ status: TaskGroupStatus.RUNNING, totalCount: 3, doneCount: 2 });
    });
  });

  describe('站内通知', () => {
    it('派发 → 标注员收到 TASK_DISPATCHED；驳回 → TASK_REJECTED；未读数 / 列表 / 标记已读只作用于本人', async () => {
      const before = (await post(h.app, '/api/notification/getUnreadCount', f.labeler2.token, {}))
        .body.data.unread as number;
      const caseId = await createCaseOk(
        h.app,
        f.labelAdmin.token,
        caseBody(f, { labelers: [f.labeler2.username], preDispatchSize: 2 }),
      );
      const group = (await selectGroups(h.ctx, caseId)).find(
        (g) => g.type === 1 && g.stage === TaskType.LABEL,
      )!;
      const unread = await post(h.app, '/api/notification/getUnreadCount', f.labeler2.token, {});
      expect(unread.body.data.unread).toBe(before + 1);
      const list = await post(h.app, '/api/notification/getNotificationList', f.labeler2.token, {
        onlyUnread: true,
        pageSize: 5,
      });
      const dispatched = list.body.data[0];
      expect(dispatched).toMatchObject({
        type: 'TASK_DISPATCHED',
        refType: 'TASK_GROUP',
        refId: group.id,
        read: false,
      });
      expect(dispatched.title).toContain('2 条标注任务');
      // 别人标记不了
      const other = await post(h.app, '/api/notification/markRead', f.labeler1.token, {
        notificationIds: [dispatched.notificationId],
      });
      expect(other.body.data.updated).toBe(0);
      const marked = await post(h.app, '/api/notification/markRead', f.labeler2.token, {
        notificationIds: [dispatched.notificationId],
      });
      expect(marked.body.data.updated).toBe(1);
      expect(
        (await post(h.app, '/api/notification/getUnreadCount', f.labeler2.token, {})).body.data
          .unread,
      ).toBe(before);
      // 驳回通知
      const label = (await selectTasks(h.ctx, caseId)).find(
        (t) => t.taskType === TaskType.LABEL && t.status === 2,
      )!;
      await labelAndSubmit(h.app, f.labeler2.token, label.id);
      const rv = await waitForTask(
        h.ctx,
        caseId,
        TaskType.FIRST_CHECK,
        label.dataSampleId,
        (r) => r.status === TaskStatus.REVIEWING,
      );
      await review(h.app, f.reviewer.token, rv.id, 0, '标签选错了');
      const rejected = (await notifications(f.labeler2.username)).find(
        (n) => n.type === 'TASK_REJECTED' && n.refId === group.id,
      );
      expect(rejected).toBeTruthy();
      expect(rejected!.content).toContain('标签选错了');
      expect(rejected!.content).toContain('第 2 轮');
      // 全部标记已读（不传 ids）
      const all = await post(h.app, '/api/notification/markRead', f.labeler2.token, {});
      expect(all.body.data.updated).toBeGreaterThanOrEqual(1);
      expect(
        (await post(h.app, '/api/notification/getUnreadCount', f.labeler2.token, {})).body.data
          .unread,
      ).toBe(0);
      // AI 阶段派发不通知（aiCode 不是用户）
      expect(
        (await post(h.app, '/api/notification/markRead', f.labeler2.token, { notificationIds: [] }))
          .body.data.updated,
      ).toBe(0);
    });
  });

  describe('截止时间', () => {
    it('创建时校验；updateCaseDeadline 设置 / 清除；列表带 deadline；结束后不可改', async () => {
      const past = Date.now() - 1000;
      const bad = await post(h.app, '/api/case/createCase', f.labelAdmin.token, {
        ...caseBody(f),
        deadline: past,
      });
      expect(bad.body.code).toBe('DEADLINE_INVALID');
      const future = Date.now() + 7 * 24 * 3600 * 1000;
      const caseId = await createCaseOk(h.app, f.labelAdmin.token, {
        ...caseBody(f),
        deadline: future,
      });
      const detail = await post(h.app, '/api/case/getCaseDetail', f.labelAdmin.token, { caseId });
      expect(detail.body.data.ext.deadline).toBe(future);
      const list = await post(h.app, '/api/case/getCaseList', f.labelAdmin.token, {
        spaceCode: f.spaceCode,
        pageSize: 100,
      });
      expect(list.body.data.find((c: { caseId: number }) => c.caseId === caseId).deadline).toBe(
        future,
      );
      expect(
        (
          await post(h.app, '/api/case/updateCaseDeadline', f.labeler1.token, {
            caseId,
            deadline: future,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await post(h.app, '/api/case/updateCaseDeadline', f.labelAdmin.token, {
            caseId,
            deadline: past,
          })
        ).body.code,
      ).toBe('DEADLINE_INVALID');
      const cleared = await post(h.app, '/api/case/updateCaseDeadline', f.labelAdmin.token, {
        caseId,
        deadline: null,
      });
      expect(cleared.body.data).toEqual({ caseId, deadline: null });
      expect((await caseRow(caseId)).ext).toMatchObject({ deadline: null });
      await setStatus(f.labelAdmin.token, caseId, CaseStatus.FINISHED);
      expect(
        (
          await post(h.app, '/api/case/updateCaseDeadline', f.labelAdmin.token, {
            caseId,
            deadline: future,
          })
        ).body.code,
      ).toBe('CASE_FINISHED');
    });

    it('扫描：24h 内提醒一次、逾期通知一次（创建人 + 空间管理员去重）；重设后可再发；lastExport 不被覆盖', async () => {
      const soon = Date.now() + DEADLINE_REMINDER_AHEAD_MS - 60_000;
      const caseId = await createCaseOk(h.app, f.labelAdmin.token, {
        ...caseBody(f),
        deadline: soon,
      });
      // 导出触发写 lastExport，不能把 deadline 冲掉（合并式 ext）
      await post(h.app, '/api/case/exportCaseResult', f.labelAdmin.token, {
        caseId,
        format: 'csv',
      });
      expect((await caseRow(caseId)).ext).toMatchObject({ deadline: soon });

      const scheduler = startDeadlineScheduler(h.ctx, h.mod, 3_600_000);
      try {
        expect(await scheduler.runOnce()).toBeGreaterThanOrEqual(1);
        expect(await scheduler.runOnce()).toBe(0); // 不重复
        const reminders = (await notifications(f.labelAdmin.username)).filter(
          (n) => n.type === 'CASE_DEADLINE' && n.refId === caseId,
        );
        expect(reminders).toHaveLength(1);
        expect(reminders[0]!.title).toContain('将于');
        // 时间推到逾期 → 再发一条逾期
        expect(await h.mod.caseService.scanDeadlines(soon + 1)).toBeGreaterThanOrEqual(1);
        expect(await h.mod.caseService.scanDeadlines(soon + 2)).toBe(0);
        const overdue = (await notifications(f.labelAdmin.username)).filter(
          (n) => n.type === 'CASE_DEADLINE' && n.refId === caseId,
        );
        expect(overdue).toHaveLength(2);
        expect(overdue[0]!.title).toContain('已于');
        // 重设 deadline → 标记清零 → 可再提醒
        await post(h.app, '/api/case/updateCaseDeadline', f.labelAdmin.token, {
          caseId,
          deadline: Date.now() + 3_600_000,
        });
        expect(await scheduler.runOnce()).toBeGreaterThanOrEqual(1);
        // 已暂停 / 已结束的不扫
        await setStatus(f.labelAdmin.token, caseId, CaseStatus.PAUSED);
        await post(h.app, '/api/case/updateCaseDeadline', f.labelAdmin.token, {
          caseId,
          deadline: Date.now() + 3_600_000,
        });
        expect(await scheduler.runOnce()).toBe(0);
      } finally {
        await scheduler.stop();
      }
    });
  });
});
