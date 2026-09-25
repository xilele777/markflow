import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatasetParseService } from '../src/modules/dataset/dataset-parse.worker.js';
import { allocateFixedQuotas } from '../src/modules/task/dispatch-engine.js';
import { processTaskCompleted } from '../src/modules/task/task.workers.js';
import { createLabelToolRow, uniq } from './helpers/app.js';
import { insertDataset, insertVersion } from './helpers/dataset.js';
import {
  caseBody,
  createCaseOk,
  createFixture,
  createPipelineHarness,
  labelAndSubmit,
  post,
  review,
  selectTasks,
  type Fixture,
  type PipelineHarness,
} from './helpers/pipeline.js';

describe('2026-09-24 审查回归', () => {
  let h: PipelineHarness;
  let f: Fixture;
  beforeAll(async () => {
    h = await createPipelineHarness();
    f = await createFixture(h.ctx, h.app, 6);
  });
  afterAll(() => h.close());

  const forward = async (taskId: number) => {
    const source = await h.ctx.db
      .selectFrom('label_task')
      .selectAll()
      .where('id', '=', taskId)
      .executeTakeFirstOrThrow();
    const event = {
      taskId,
      caseId: source.caseId,
      dataSampleId: source.dataSampleId,
      currentStageType: 'label',
      nextStageType: 'review',
      annotator: source.annotator,
      round: source.round,
      completedTime: source.updateTime,
    };
    await processTaskCompleted(h.ctx, h.mod, event);
    return event;
  };

  it('B1：跨空间、已删除数据集、结果集及工具不匹配均不能创建任务', async () => {
    const foreign = await createFixture(h.ctx, h.app, 1);
    const otherTool = uniq('tool');
    await createLabelToolRow(h.ctx, { labelToolCode: otherTool });
    const attempts: Array<[object, string]> = [
      [{ ...caseBody(f), datasetVersionId: foreign.versionId }, 'DATASET_VERSION_NOT_FOUND'],
      [{ ...caseBody(f), labelTool: otherTool }, 'DATASET_TOOL_MISMATCH'],
    ];
    for (const [datasetType, deleted, code] of [
      [3, 0, 'DATASET_TOOL_MISMATCH'],
      [1, 1, 'DATASET_VERSION_NOT_FOUND'],
    ] as const) {
      const datasetId = await insertDataset(h.ctx, {
        spaceCode: f.spaceCode,
        datasetName: uniq('ds'),
        labelToolCode: f.toolCode,
      });
      await h.ctx.db
        .updateTable('markflow_dataset')
        .set({ datasetType, deleted })
        .where('id', '=', datasetId)
        .execute();
      const datasetVersionId = await insertVersion(h.ctx, {
        datasetId,
        ossPath: 'test.jsonl',
        uploadStatus: 2,
      });
      attempts.push([{ ...caseBody(f), datasetVersionId }, code]);
    }
    for (const [body, code] of attempts) {
      const response = await post(h.app, '/api/case/createCase', f.labelAdmin.token, body);
      expect(response.body).toMatchObject({ success: false, code });
    }
  });

  it('B2：5000 条样本完整入池，无参数溢出，分页及源样本可读取', async () => {
    const large = await createFixture(h.ctx, h.app, 0);
    const now = Date.now();
    for (let offset = 0; offset < 5000; offset += 500) {
      await h.ctx.db
        .insertInto('markflow_dataset_sample')
        .values(
          Array.from({ length: 500 }, (_, index) => ({
            datasetVersionId: large.versionId,
            bizId: String(offset + index),
            sampleDataJson: JSON.stringify({ text: `sample ${offset + index}` }),
            deleted: 0,
            ext: null,
            creator: 'test',
            operator: 'test',
            createTime: now,
            updateTime: now,
          })),
        )
        .execute();
    }
    await h.ctx.db
      .updateTable('markflow_dataset_version')
      .set({ sampleCount: 5000 })
      .where('id', '=', large.versionId)
      .execute();
    const caseId = await createCaseOk(
      h.app,
      large.labelAdmin.token,
      caseBody(large, { stages: ['label'] }),
    );
    const tasks = await selectTasks(h.ctx, caseId);
    expect(tasks).toHaveLength(5000);
    expect(new Set(tasks.map((task) => task.dataSampleId)).size).toBe(5000);
    expect(tasks.filter((task) => task.status === 2)).toHaveLength(3);
    const sample = await post(h.app, '/api/task/getSampleData', large.labelAdmin.token, {
      taskId: tasks.at(-1)!.id,
    });
    expect(sample.body).toMatchObject({
      success: true,
      data: { sampleData: { text: 'sample 4999' } },
    });
    // 重复入池不影响总量（ON CONFLICT 在事务内有效）。
    await h.ctx.db.transaction().execute((trx) =>
      h.mod.dispatch.enqueueToPool(
        trx,
        caseId,
        3,
        tasks.map((task) => task.dataSampleId),
      ),
    );
    expect(await selectTasks(h.ctx, caseId)).toHaveLength(5000);
  });

  it('B3：提交后保存被拒绝，审核中的结果保持原值', async () => {
    const caseId = await createCaseOk(h.app, f.labelAdmin.token, caseBody(f));
    const task = (await selectTasks(h.ctx, caseId)).find((row) => row.status === 2)!;
    await labelAndSubmit(h.app, f.labeler1.token, task.id, { label: 'before-review' });
    await forward(task.id);
    const saved = await post(h.app, '/api/task/saveTaskResult', f.labeler1.token, {
      taskId: task.id,
      sampleType: 1,
      result: { label: 'changed-after-submit' },
    });
    expect(saved.body).toMatchObject({ success: false, code: 'TASK_ALREADY_COMPLETED' });
    const target = (await selectTasks(h.ctx, caseId)).find((row) => row.taskType === 4)!;
    const result = await post(h.app, '/api/task/getTaskResult', f.reviewer.token, {
      taskId: target.id,
      sampleType: 1,
    });
    expect(result.body.data.result).toEqual({ label: 'before-review' });
  });

  it('B3：四个任务并发首次保存不会因结果版本初始化耗尽连接池', async () => {
    const caseId = await createCaseOk(
      h.app,
      f.labelAdmin.token,
      caseBody(f, { preDispatchSize: 4 }),
    );
    const tasks = (await selectTasks(h.ctx, caseId)).filter((task) => task.status === 2);
    expect(tasks).toHaveLength(4);
    await Promise.all(
      tasks.map((task) => h.mod.taskService.saveTaskResultInternal(task, 1, { label: 'parallel' })),
    );
    for (const task of tasks) {
      const result = await post(h.app, '/api/task/getTaskResult', f.labeler1.token, {
        taskId: task.id,
        sampleType: 1,
      });
      expect(result.body.data.result).toEqual({ label: 'parallel' });
    }
  });

  it('B4：入池失败会回滚推进标记；提交后派发失败可重试且不重复入池', async () => {
    const caseId = await createCaseOk(h.app, f.labelAdmin.token, caseBody(f));
    const task = (await selectTasks(h.ctx, caseId)).find((row) => row.status === 2)!;
    await labelAndSubmit(h.app, f.labeler1.token, task.id);
    const enqueue = vi
      .spyOn(h.mod.dispatch, 'enqueueToPool')
      .mockRejectedValueOnce(new Error('enqueue fault'));
    try {
      await expect(forward(task.id)).rejects.toThrow('enqueue fault');
      expect(
        (await selectTasks(h.ctx, caseId)).find((row) => row.id === task.id)?.forwardedRound,
      ).toBe(0);
      const dispatch = vi
        .spyOn(h.mod.dispatch, 'dispatchPool')
        .mockRejectedValueOnce(new Error('dispatch fault'));
      try {
        await expect(forward(task.id)).rejects.toThrow('dispatch fault');
        expect(
          (await selectTasks(h.ctx, caseId)).find((row) => row.id === task.id)?.forwardedRound,
        ).toBe(1);
        const event = await forward(task.id);
        await processTaskCompleted(h.ctx, h.mod, { ...event, round: undefined });
        expect(enqueue).toHaveBeenCalledTimes(2);
        const target = (await selectTasks(h.ctx, caseId)).filter((row) => row.taskType === 4);
        expect(target).toHaveLength(1);
        expect(target[0]).toMatchObject({ status: 3, round: 1 });
      } finally {
        dispatch.mockRestore();
      }
    } finally {
      enqueue.mockRestore();
    }
  });

  it('B3：旧轮次、已回收及重新领取后的保存与提交都不能通过事务状态校验', async () => {
    const caseId = await createCaseOk(h.app, f.labelAdmin.token, caseBody(f));
    const stale = (await selectTasks(h.ctx, caseId)).find((row) => row.status === 2)!;
    await h.mod.taskService.saveTaskResultInternal(stale, 1, { label: 'original' });
    for (const change of [
      { status: 1, annotator: null },
      { status: 5, annotator: stale.annotator, round: 2 },
      { status: 2, round: 1, claimTime: stale.claimTime! + 1 },
    ]) {
      await h.ctx.db.updateTable('label_task').set(change).where('id', '=', stale.id).execute();
      await expect(
        h.mod.taskService.saveTaskResultInternal(stale, 1, { label: 'stale' }),
      ).rejects.toMatchObject({ code: 'TASK_STATE_CHANGED' });
      await expect(h.mod.taskService.submitLabelTaskInternal(stale)).rejects.toMatchObject({
        code: 'TASK_STATE_CHANGED',
      });
    }
  });

  it('B4：完成消息并发重放不重开已通过的审核；真正的新轮次仍可推进', async () => {
    const caseId = await createCaseOk(h.app, f.labelAdmin.token, caseBody(f));
    const source = (await selectTasks(h.ctx, caseId)).find((row) => row.status === 2)!;
    await labelAndSubmit(h.app, f.labeler1.token, source.id);
    const event = await forward(source.id);
    const target = (await selectTasks(h.ctx, caseId)).find((row) => row.taskType === 4)!;
    expect((await review(h.app, f.reviewer.token, target.id, 1)).body.success).toBe(true);
    await Promise.all(Array.from({ length: 3 }, () => processTaskCompleted(h.ctx, h.mod, event)));
    expect((await selectTasks(h.ctx, caseId)).find((row) => row.id === target.id)).toMatchObject({
      status: 4,
      round: 1,
    });

    // 另一条审核正常驳回，标注 round=2 完成后下游只重开一次。
    const second = (await selectTasks(h.ctx, caseId)).find((row) => row.status === 2)!;
    await labelAndSubmit(h.app, f.labeler1.token, second.id);
    const oldEvent = await forward(second.id);
    const rejected = (await selectTasks(h.ctx, caseId)).find(
      (row) => row.taskType === 4 && row.dataSampleId === second.dataSampleId,
    )!;
    expect((await review(h.app, f.reviewer.token, rejected.id, 0, '重新标注')).body.success).toBe(
      true,
    );
    await labelAndSubmit(h.app, f.labeler1.token, second.id, { label: 'fixed' });
    await processTaskCompleted(h.ctx, h.mod, oldEvent);
    expect((await selectTasks(h.ctx, caseId)).find((row) => row.id === rejected.id)).toMatchObject({
      status: 4,
      round: 1,
    });
    const newEvent = await forward(second.id);
    await processTaskCompleted(h.ctx, h.mod, newEvent);
    expect((await selectTasks(h.ctx, caseId)).find((row) => row.id === rejected.id)).toMatchObject({
      status: 3,
      round: 2,
    });
  });

  it('B5：READY 版本重复消费后，既有任务仍引用相同源样本', async () => {
    const caseId = await createCaseOk(h.app, f.labelAdmin.token, caseBody(f));
    const task = (await selectTasks(h.ctx, caseId)).find((row) => row.status === 2)!;
    const read = () =>
      post(h.app, '/api/task/getSampleData', f.labeler1.token, { taskId: task.id });
    const before = await read();
    await createDatasetParseService(h.ctx).parseDatasetVersion(f.versionId);
    expect((await read()).body).toMatchObject({ success: true, data: before.body.data });
    expect(before.body.success).toBe(true);
    expect((await selectTasks(h.ctx, caseId)).find((row) => row.id === task.id)?.dataSampleId).toBe(
      task.dataSampleId,
    );
  });

  it.each([1, 3])('B6：%i 条样本按 50/50 分配后可全部完成并自动结束', async (count) => {
    const fixture = await createFixture(h.ctx, h.app, count);
    const caseId = await createCaseOk(
      h.app,
      fixture.labelAdmin.token,
      caseBody(fixture, {
        stages: ['label'],
        strategy: 2,
        labelers: [fixture.labeler1.username, fixture.labeler2.username],
        preDispatchSize: 1,
      }),
    );
    for (let i = 0; i < count; i += 1) {
      const task = (await selectTasks(h.ctx, caseId)).find((row) => row.status === 2)!;
      expect(task).toBeDefined();
      const token =
        task.annotator === fixture.labeler1.username
          ? fixture.labeler1.token
          : fixture.labeler2.token;
      await labelAndSubmit(h.app, token, task.id);
    }
    expect((await selectTasks(h.ctx, caseId)).every((row) => row.status === 4)).toBe(true);
    expect(
      await h.ctx.db
        .selectFrom('label_case')
        .select('status')
        .where('id', '=', caseId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: 4 });
  });

  it('B6：多人比例、零比例与不活跃成员，整数配额稳定且守恒', () => {
    const members = [33, 33, 34, 0].map((ratio, index) => ({
      username: `u${index}`,
      ratio,
      active: true,
    }));
    members.push({ username: 'inactive', ratio: 100, active: false });
    for (const total of [0, 1, 3, 7, 101, 5000]) {
      const quotas = allocateFixedQuotas(total, members);
      expect([...quotas.values()].reduce((sum, n) => sum + n, 0)).toBe(total);
      expect(quotas.get('u3')).toBe(0);
      expect(quotas.has('inactive')).toBe(false);
    }
    expect([...allocateFixedQuotas(7, members).values()]).toEqual([2, 2, 3, 0]);
  });

  it('N1：同一 username 多条时按用户合并，配额仍守恒且不丢失', () => {
    const dup = [
      { username: 'a', ratio: 50, active: true },
      { username: 'a', ratio: 30, active: true },
      { username: 'b', ratio: 20, active: true },
    ];
    const quotas = allocateFixedQuotas(10, dup);
    // 旧实现 new Map 收敛后 a 只剩 3，总量仅 5。
    expect([...quotas.entries()]).toEqual([
      ['a', 8],
      ['b', 2],
    ]);
    expect([...quotas.values()].reduce((sum, n) => sum + n, 0)).toBe(10);
    // 同用户中 inactive 的条目不合并（inactive 的 ratio 不参与分配）。
    const mixed = [
      { username: 'a', ratio: 40, active: true },
      { username: 'a', ratio: 60, active: false },
      { username: 'b', ratio: 60, active: true },
    ];
    const mixedQuotas = allocateFixedQuotas(10, mixed);
    expect([...mixedQuotas.values()].reduce((sum, n) => sum + n, 0)).toBe(10);
    expect(mixedQuotas.get('a')).toBe(4);
  });
});
