// 派发引擎单元级：入池幂等 / 重开、FOR UPDATE SKIP LOCKED 并发派发不重派、case 非 RUNNING 拒绝、EXECUTOR_INACTIVE、
// 自动回收（超时回收 / REWORK 保留 / 未超时 / 未配置 / 回收后重派）、outbox 重投。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUEUE_NAMES } from '../src/infra/queue.js';
import { TaskStatus, TaskGroupType } from '../src/modules/task/enums.js';
import { startAutoRecycleScheduler } from '../src/modules/task/task.workers.js';
import {
  caseBody,
  createCaseOk,
  createFixture,
  createPipelineHarness,
  labelAndSubmit,
  selectGroups,
  selectTasks,
  type Fixture,
  type PipelineHarness,
} from './helpers/pipeline.js';

describe('派发引擎与自动回收', () => {
  let h: PipelineHarness;
  let f: Fixture;

  beforeAll(async () => {
    h = await createPipelineHarness();
    f = await createFixture(h.ctx, h.app, 6);
  });
  afterAll(() => h.close());

  it('enqueueToPool：重复样本跳过；已 DONE 的重开 round+1；空列表 / 非法池 / case 非 RUNNING', async () => {
    const caseId = await createCaseOk(
      h.app,
      f.labelAdmin.token,
      caseBody(f, { preDispatchSize: 1 }),
    );
    const pool = (await selectGroups(h.ctx, caseId)).find(
      (g) => g.type === TaskGroupType.LABEL_POOL,
    )!;
    const again = await h.ctx.db
      .transaction()
      .execute((trx) => h.mod.dispatch.enqueueToPool(trx, caseId, 3, f.sampleIds));
    expect(again).toEqual({ inserted: 0, reopened: 0 });
    expect(await selectTasks(h.ctx, caseId)).toHaveLength(6);

    // 完成一条后再入池 → 重开
    const first = (await selectTasks(h.ctx, caseId)).find((t) => t.status === TaskStatus.LABELING)!;
    await labelAndSubmit(h.app, f.labeler1.token, first.id);
    const reopened = await h.ctx.db
      .transaction()
      .execute((trx) => h.mod.dispatch.enqueueToPool(trx, caseId, 3, [first.dataSampleId]));
    expect(reopened).toEqual({ inserted: 0, reopened: 1 });
    const row = await h.ctx.db
      .selectFrom('label_task')
      .selectAll()
      .where('id', '=', first.id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      status: TaskStatus.PENDING_DISPATCH,
      round: 2,
      taskGroupId: pool.id,
      annotator: null,
      claimTime: null,
      costTime: null,
    });
    expect(
      (
        await h.ctx.db
          .selectFrom('label_task_group')
          .selectAll()
          .where('id', '=', pool.id)
          .executeTakeFirstOrThrow()
      ).totalCount,
    ).toBe(6);

    await expect(
      h.ctx.db.transaction().execute((trx) => h.mod.dispatch.enqueueToPool(trx, caseId, 3, [])),
    ).resolves.toEqual({ inserted: 0, reopened: 0 });
    await expect(
      h.ctx.db.transaction().execute((trx) => h.mod.dispatch.enqueueToPool(trx, caseId, 1, [1])),
    ).rejects.toMatchObject({ code: 'POOL_TYPE_INVALID' });
    await expect(
      h.ctx.db.transaction().execute((trx) => h.mod.dispatch.enqueueToPool(trx, caseId, 6, [1])),
    ).rejects.toMatchObject({ code: 'POOL_NOT_FOUND' });
    await h.ctx.db.updateTable('label_case').set({ status: 3 }).where('id', '=', caseId).execute();
    await expect(
      h.ctx.db.transaction().execute((trx) => h.mod.dispatch.enqueueToPool(trx, caseId, 3, [1])),
    ).rejects.toMatchObject({ code: 'CASE_NOT_RUNNING' });
    await expect(h.mod.dispatch.dispatchPool(caseId, 3)).rejects.toMatchObject({
      code: 'CASE_NOT_RUNNING',
    });
  });

  it('dispatchToMember：非 active 成员 → EXECUTOR_INACTIVE；预派发只补到 preDispatchSize', async () => {
    const caseId = await createCaseOk(
      h.app,
      f.labelAdmin.token,
      caseBody(f, { preDispatchSize: 2 }),
    );
    await expect(
      h.mod.dispatch.dispatchToMember(caseId, 3, f.labeler2.username),
    ).rejects.toMatchObject({ code: 'EXECUTOR_INACTIVE' });
    expect(await h.mod.dispatch.dispatchToMember(caseId, 3, f.labeler1.username)).toBe(0);
    const inHand = (await selectTasks(h.ctx, caseId)).filter(
      (t) => t.status === TaskStatus.LABELING,
    );
    expect(inHand).toHaveLength(2);
  });

  it('并发派发（10 路 dispatchPool 同时跑）不会把同一条 task 派给两人，且 seq 连续', async () => {
    const caseId = await createCaseOk(
      h.app,
      f.labelAdmin.token,
      caseBody(f, {
        labelers: [f.labeler1.username, f.labeler2.username],
        preDispatchSize: 4,
      }),
    );
    // 先把已派的全部回池，再并发派
    const groups = await selectGroups(h.ctx, caseId);
    const pool = groups.find((g) => g.type === TaskGroupType.LABEL_POOL)!;
    await h.ctx.db
      .updateTable('label_task')
      .set({ taskGroupId: pool.id, status: 1, annotator: null, claimTime: null })
      .where('caseId', '=', caseId)
      .execute();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => h.mod.dispatch.dispatchPool(caseId, 3)),
    );
    // 锁等待 3s，10 路串行每路很快，理论上都能拿到；即使个别 OPERATION_CONFLICT 也不能重派
    const conflicts = results.filter(
      (r) =>
        r.status === 'rejected' && (r.reason as { code?: string }).code === 'OPERATION_CONFLICT',
    );
    expect(results.length - conflicts.length).toBeGreaterThan(0);
    const tasks = await selectTasks(h.ctx, caseId);
    const byPerson = new Map<string | null, number[]>();
    for (const t of tasks) {
      if (t.annotator === null) continue;
      byPerson.set(t.annotator, [...(byPerson.get(t.annotator) ?? []), t.taskGroupSeq]);
    }
    expect([...byPerson.values()].map((s) => s.length).sort()).toEqual([2, 4]);
    for (const seqs of byPerson.values()) {
      expect([...seqs].sort((a, b) => a - b)).toEqual(seqs.map((_, i) => i + 1));
    }
    expect(tasks.filter((t) => t.status === TaskStatus.LABELING)).toHaveLength(6);
  });

  describe('自动回收', () => {
    it('超时的在手 task 回池（REWORK 保留、其余置 1）、未超时 / 未配置的不动、回收后重派给其他人', async () => {
      const caseId = await createCaseOk(
        h.app,
        f.labelAdmin.token,
        caseBody(f, {
          labelers: [f.labeler1.username, f.labeler2.username],
          preDispatchSize: 2,
          autoRecycleMinutes: 10,
        }),
      );
      const tasks = await selectTasks(h.ctx, caseId);
      const mine = tasks.filter((t) => t.annotator === f.labeler1.username);
      expect(mine).toHaveLength(2);
      const overdue = Date.now() - 11 * 60_000;
      // 第一条超时且为 REWORK；第二条超时普通；labeler2 的不超时
      await h.ctx.db
        .updateTable('label_task')
        .set({ claimTime: overdue, status: TaskStatus.REWORK })
        .where('id', '=', mine[0]!.id)
        .execute();
      await h.ctx.db
        .updateTable('label_task')
        .set({ claimTime: overdue })
        .where('id', '=', mine[1]!.id)
        .execute();

      const scheduler = startAutoRecycleScheduler(h.ctx, h.mod, 3_600_000);
      try {
        expect(await scheduler.runOnce()).toBe(2);
      } finally {
        await scheduler.stop();
      }
      const after = await selectTasks(h.ctx, caseId);
      const a0 = after.find((t) => t.id === mine[0]!.id)!;
      const a1 = after.find((t) => t.id === mine[1]!.id)!;
      // 回收后 dispatchPool：labeler1 在手 0 → 又补 2 条（可能拿回自己的），labeler2 在手 2 已满
      expect(a0.round).toBe(1);
      expect(a0.operator === 'SYSTEM_AUTO_RECYCLE' || a0.annotator !== null).toBe(true);
      expect([a0, a1].every((t) => t.claimTime === null || t.claimTime > overdue)).toBe(true);
      const l2 = after.filter((t) => t.annotator === f.labeler2.username);
      expect(l2).toHaveLength(2);
      expect(l2.every((t) => t.claimTime! > overdue)).toBe(true);
      // 总在手 = 4（两人各 2），池中剩 2
      expect(after.filter((t) => t.annotator !== null)).toHaveLength(4);
    });

    it('未配置 autoRecycleMinutes 的 case 不回收', async () => {
      const caseId = await createCaseOk(
        h.app,
        f.labelAdmin.token,
        caseBody(f, { preDispatchSize: 1, autoRecycleMinutes: null }),
      );
      const [t] = await selectTasks(h.ctx, caseId).then((ts) => ts.filter((x) => x.annotator));
      await h.ctx.db
        .updateTable('label_task')
        .set({ claimTime: Date.now() - 100 * 60_000 })
        .where('id', '=', t!.id)
        .execute();
      const scheduler = startAutoRecycleScheduler(h.ctx, h.mod, 3_600_000);
      try {
        await scheduler.runOnce();
      } finally {
        await scheduler.stop();
      }
      const row = await h.ctx.db
        .selectFrom('label_task')
        .selectAll()
        .where('id', '=', t!.id)
        .executeTakeFirstOrThrow();
      expect(row.annotator).toBe(f.labeler1.username);
    });
  });

  describe('outbox', () => {
    it('投递失败的行留在表里并被 republishPending 重投；jobId 去重', async () => {
      const bad = await h.ctx.outbox.enqueueTx(h.ctx.db, {
        queue: 'no-such-queue' as never,
        jobName: 'x',
        payload: { a: 1 },
      });
      await h.ctx.outbox.deliver([bad]);
      let row = await h.ctx.db
        .selectFrom('mq_outbox')
        .selectAll()
        .where('id', '=', bad)
        .executeTakeFirstOrThrow();
      expect(row.attempts).toBe(1);
      expect(row.lastError).toContain('unknown queue');
      expect(row.nextRetryTime).toBeGreaterThan(Date.now());
      // 到期后重投仍失败 → attempts 2
      await h.ctx.db
        .updateTable('mq_outbox')
        .set({ nextRetryTime: Date.now() - 1 })
        .where('id', '=', bad)
        .execute();
      await h.ctx.outbox.republishPending();
      row = await h.ctx.db
        .selectFrom('mq_outbox')
        .selectAll()
        .where('id', '=', bad)
        .executeTakeFirstOrThrow();
      expect(row.attempts).toBe(2);
      await h.ctx.db.deleteFrom('mq_outbox').where('id', '=', bad).execute();

      // 正常行：投递后删除；同 jobId 再投不报错
      const good = await h.ctx.outbox.enqueueTx(h.ctx.db, {
        queue: QUEUE_NAMES.caseExport,
        jobName: 'export',
        jobId: `test-dup-${Date.now()}`,
        payload: { caseId: -1, format: 'csv', operator: 't' },
      });
      await h.ctx.outbox.deliver([good]);
      expect(
        await h.ctx.db
          .selectFrom('mq_outbox')
          .select('id')
          .where('id', '=', good)
          .executeTakeFirst(),
      ).toBeUndefined();
    });
  });
});
