import { sql } from 'kysely';
import type { Database, NewTask, TaskRow } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import type { Maybe } from '../common/strings.js';
import { CaseStatus, IN_HAND_STATUSES, POOL_STATUSES, TaskGroupType, TaskStatus } from './enums.js';

/** case 详情进度投影（对应 Java TaskProgressRow）。 */
export interface TaskProgressRow {
  taskType: number;
  status: number;
  groupType: number;
  cnt: number;
}

/** 对应 Java TaskRepository（「我的贡献」统计在 task-stats.repo.ts）。 */
export class TaskRepository {
  constructor(private readonly db: Db) {}

  withDb(db: Db): TaskRepository {
    return new TaskRepository(db);
  }

  async batchInsert(rows: NewTask[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insertInto('label_task').values(rows).execute();
  }

  selectById(id: number): Promise<TaskRow | undefined> {
    return this.db.selectFrom('label_task').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /** 给定样本集中已存在 (caseId, taskType, dataSampleId) 的 task 行（入池去重 / 重开判断）。 */
  selectExistingByCaseTypeAndSamples(
    caseId: number,
    taskType: number,
    sampleIds: readonly number[],
  ): Promise<TaskRow[]> {
    if (sampleIds.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('label_task')
      .selectAll()
      .where('caseId', '=', caseId)
      .where('taskType', '=', taskType)
      .where('dataSampleId', 'in', [...sampleIds])
      .execute();
  }

  /** 按 (caseId, taskType, dataSampleId) 取唯一 task（uk_task_case_type_sample）。 */
  selectByCaseTypeAndSample(
    caseId: number,
    taskType: number,
    dataSampleId: number,
  ): Promise<TaskRow | undefined> {
    return this.db
      .selectFrom('label_task')
      .selectAll()
      .where('caseId', '=', caseId)
      .where('taskType', '=', taskType)
      .where('dataSampleId', '=', dataSampleId)
      .executeTakeFirst();
  }

  /** 个人组在手量：status IN (2,3,5)。 */
  async countInHand(groupId: number): Promise<number> {
    const row = await this.db
      .selectFrom('label_task')
      .select(({ fn }) => fn.countAll<number>().as('n'))
      .where('taskGroupId', '=', groupId)
      .where('status', 'in', [...IN_HAND_STATUSES])
      .executeTakeFirstOrThrow();
    return row.n;
  }

  /** 个人组历史承接量（含已完成），固定分配配额上限用。 */
  async countByGroup(groupId: number): Promise<number> {
    const row = await this.db
      .selectFrom('label_task')
      .select(({ fn }) => fn.countAll<number>().as('n'))
      .where('taskGroupId', '=', groupId)
      .executeTakeFirstOrThrow();
    return row.n;
  }

  async maxSeqInGroup(groupId: number): Promise<number> {
    const row = await this.db
      .selectFrom('label_task')
      .select(({ fn }) => fn.max('taskGroupSeq').as('m'))
      .where('taskGroupId', '=', groupId)
      .executeTakeFirst();
    return row?.m ?? 0;
  }

  /**
   * 从池中取可派 task（status 1/5，seq 升序），事务内行锁并跳过被其它事务锁住的行
   * （规则表 3.2.7：FOR UPDATE SKIP LOCKED，替代 Java 无锁 takeFromPool）。
   */
  takeFromPoolForUpdate(poolGroupId: number, limit: number): Promise<TaskRow[]> {
    if (limit <= 0) return Promise.resolve([]);
    return this.db
      .selectFrom('label_task')
      .selectAll()
      .where('taskGroupId', '=', poolGroupId)
      .where('status', 'in', [...POOL_STATUSES])
      .orderBy('taskGroupSeq', 'asc')
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .execute();
  }

  /** 池 task 移入个人组（条件更新：仍在该池且 status 1/5）；affected=0 视为竞态跳过。 */
  async moveToPersonalGroup(
    taskId: number,
    poolGroupId: number,
    personalGroupId: number,
    newStatus: number,
    annotator: string,
    newSeq: number,
    now: number,
  ): Promise<number> {
    const result = await this.db
      .updateTable('label_task')
      .set({
        taskGroupId: personalGroupId,
        status: newStatus,
        annotator,
        claimTime: now,
        taskGroupSeq: newSeq,
        updateTime: now,
      })
      .where('id', '=', taskId)
      .where('taskGroupId', '=', poolGroupId)
      .where('status', 'in', [...POOL_STATUSES])
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /** 收尾：置完成态（仅当未完成）；affected=0 表示已完成（竞态）。 */
  async updateToCompleted(
    taskId: number,
    costTime: number | null,
    operator: string,
    now: number,
  ): Promise<number> {
    const result = await this.db
      .updateTable('label_task')
      .set({ status: TaskStatus.DONE, costTime, operator, updateTime: now })
      .where('id', '=', taskId)
      .where('status', '!=', TaskStatus.DONE)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /** 驳回：留在原个人组，置打回重标、round+1；claimTime 重置为 now（规则表 5.5a）。 */
  async rejectKeepInGroup(taskId: number, operator: string, now: number): Promise<void> {
    await this.db
      .updateTable('label_task')
      .set({
        status: TaskStatus.REWORK,
        round: sql`round + 1`,
        claimTime: now,
        operator,
        updateTime: now,
      })
      .where('id', '=', taskId)
      .execute();
  }

  /** 驳回：退回池子（原人 inactive），置打回重标、round+1、清 annotator/claim_time、seq 接池尾。 */
  async rejectToPool(
    taskId: number,
    poolGroupId: number,
    newSeq: number,
    operator: string,
    now: number,
  ): Promise<void> {
    await this.db
      .updateTable('label_task')
      .set({
        status: TaskStatus.REWORK,
        round: sql`round + 1`,
        taskGroupId: poolGroupId,
        taskGroupSeq: newSeq,
        annotator: null,
        claimTime: null,
        operator,
        updateTime: now,
      })
      .where('id', '=', taskId)
      .execute();
  }

  /**
   * 重开已完成的 task（规则表 3.1.6：驳回重做后再次进入本阶段）：
   * 回池、status=1、round+1、清 annotator/claimTime/costTime、seq 接池尾。仅当当前 DONE 才生效。
   */
  async reopenToPool(
    taskId: number,
    poolGroupId: number,
    newSeq: number,
    operator: string,
    now: number,
  ): Promise<number> {
    const result = await this.db
      .updateTable('label_task')
      .set({
        status: TaskStatus.PENDING_DISPATCH,
        round: sql`round + 1`,
        taskGroupId: poolGroupId,
        taskGroupSeq: newSeq,
        annotator: null,
        claimTime: null,
        costTime: null,
        operator,
        updateTime: now,
      })
      .where('id', '=', taskId)
      .where('status', '=', TaskStatus.DONE)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /**
   * 自动回收：回池（status 5 保留否则置 1），清 annotator/claim_time，round 不变。
   * 条件更新（仍在原个人组、仍在手、已领取）；affected=0 视为竞态丢失。
   */
  async recycleToPool(
    taskId: number,
    poolGroupId: number,
    currentGroupId: number,
    newSeq: number,
    operator: string,
    now: number,
  ): Promise<number> {
    const result = await this.db
      .updateTable('label_task')
      .set({
        // 用字面量而非绑定参数：pg 会把绑定值推断为 text，导致 integer 列赋值类型错误。
        status: sql`CASE WHEN status = ${sql.lit(TaskStatus.REWORK)} THEN ${sql.lit(TaskStatus.REWORK)} ELSE ${sql.lit(TaskStatus.PENDING_DISPATCH)} END`,
        taskGroupId: poolGroupId,
        taskGroupSeq: newSeq,
        annotator: null,
        claimTime: null,
        operator,
        updateTime: now,
      })
      .where('id', '=', taskId)
      .where('taskGroupId', '=', currentGroupId)
      .where('status', 'in', [...IN_HAND_STATUSES])
      .where('claimTime', 'is not', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /** 覆盖 ext（AI 失败记录等）。 */
  async updateExt(taskId: number, ext: unknown, now: number): Promise<void> {
    await this.db
      .updateTable('label_task')
      .set({ ext: JSON.stringify(ext), updateTime: now })
      .where('id', '=', taskId)
      .execute();
  }

  async countInGroup(taskGroupId: number, status: Maybe<number>): Promise<number> {
    let q = this.db
      .selectFrom('label_task')
      .select(({ fn }) => fn.countAll<number>().as('n'))
      .where('taskGroupId', '=', taskGroupId);
    if (status !== null && status !== undefined) q = q.where('status', '=', status);
    return (await q.executeTakeFirstOrThrow()).n;
  }

  /** 组内列表：在手(2/3/5) → 待分配(1) → 已完成(4)，再 seq 升序。 */
  selectInGroup(
    taskGroupId: number,
    status: Maybe<number>,
    offset: number,
    limit: number,
  ): Promise<TaskRow[]> {
    let q = this.db.selectFrom('label_task').selectAll().where('taskGroupId', '=', taskGroupId);
    if (status !== null && status !== undefined) q = q.where('status', '=', status);
    return q
      .orderBy(
        sql`CASE status WHEN 2 THEN 0 WHEN 3 THEN 0 WHEN 5 THEN 0 WHEN 1 THEN 1 WHEN 4 THEN 2 ELSE 3 END`,
        'asc',
      )
      .orderBy('taskGroupSeq', 'asc')
      .offset(offset)
      .limit(limit)
      .execute();
  }

  /** 自动回收候选：运行中 case、个人组、在手已领取，claim_time 升序。 */
  selectAutoRecycleCandidates(limit: number): Promise<TaskRow[]> {
    if (limit <= 0) return Promise.resolve([]);
    return this.db
      .selectFrom('label_task as t')
      .innerJoin('label_case as c', 'c.id', 't.caseId')
      .innerJoin('label_task_group as g', 'g.id', 't.taskGroupId')
      .selectAll('t')
      .where('c.status', '=', CaseStatus.RUNNING)
      .where('c.deleted', '=', 0)
      .where('g.type', '=', TaskGroupType.PERSONAL)
      .where('t.status', 'in', [...IN_HAND_STATUSES])
      .where('t.claimTime', 'is not', null)
      .orderBy('t.claimTime', 'asc')
      .limit(limit)
      .execute();
  }

  /** 按 (task_type, status, group.type) 聚合某 case 的 task 计数。 */
  aggregateProgress(caseId: number): Promise<TaskProgressRow[]> {
    return this.db
      .selectFrom('label_task as t')
      .innerJoin('label_task_group as g', 'g.id', 't.taskGroupId')
      .select(({ fn }) => [
        't.taskType as taskType',
        't.status as status',
        'g.type as groupType',
        fn.countAll<number>().as('cnt'),
      ])
      .where('t.caseId', '=', caseId)
      .groupBy(['t.taskType', 't.status', 'g.type'])
      .execute();
  }
}

export type TaskTable = Database['label_task'];
