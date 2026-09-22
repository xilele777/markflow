import { sql, type SelectQueryBuilder } from 'kysely';
import type { Database, NewTaskGroup, TaskGroupRow } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import { hasText, likePattern, type Maybe } from '../common/strings.js';
import { TaskGroupStatus, TaskGroupType, TaskStatus } from './enums.js';

type GroupQuery<O> = SelectQueryBuilder<Database, 'label_task_group', O>;

/** 对应 Java TaskGroupRepository。 */
export class TaskGroupRepository {
  constructor(private readonly db: Db) {}

  withDb(db: Db): TaskGroupRepository {
    return new TaskGroupRepository(db);
  }

  async insert(row: NewTaskGroup): Promise<number> {
    const inserted = await this.db
      .insertInto('label_task_group')
      .values(row)
      .returning('id')
      .executeTakeFirstOrThrow();
    return inserted.id;
  }

  selectById(id: number): Promise<TaskGroupRow | undefined> {
    return this.db
      .selectFrom('label_task_group')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** 按 (caseId, 池类型) 取池子（同 case 同类型唯一）。 */
  selectPoolByCaseAndType(caseId: number, poolType: number): Promise<TaskGroupRow | undefined> {
    return this.db
      .selectFrom('label_task_group')
      .selectAll()
      .where('caseId', '=', caseId)
      .where('type', '=', poolType)
      .executeTakeFirst();
  }

  /** 按 (caseId, stage, annotator) 取个人组（annotator 为 citext，大小写不敏感）。 */
  selectPersonalGroup(
    caseId: number,
    stage: number,
    annotator: string,
  ): Promise<TaskGroupRow | undefined> {
    return this.db
      .selectFrom('label_task_group')
      .selectAll()
      .where('caseId', '=', caseId)
      .where('type', '=', TaskGroupType.PERSONAL)
      .where('stage', '=', stage)
      .where('annotator', '=', annotator)
      .executeTakeFirst();
  }

  /** 池子任务计数 += delta。 */
  async increaseTotalCount(groupId: number, delta: number, now: number): Promise<void> {
    await this.db
      .updateTable('label_task_group')
      .set({ totalCount: sql`total_count + ${delta}`, updateTime: now })
      .where('id', '=', groupId)
      .execute();
  }

  /**
   * 重算个人组统计（规则表 0004 §10 · 9.8，M5 补）：total_count = 组内 task 数、done_count = 已完成数，
   * status = 有 task 且全完成 → DONE(3)，否则 RUNNING(2)。只作用于个人组（type=1），池子不动。
   * 调用方在移动 / 完成 / 驳回 / 回收 task 的同一事务内传入受影响的组 id。
   */
  async refreshPersonalGroupStats(groupIds: readonly number[], now: number): Promise<void> {
    const ids = [...new Set(groupIds)];
    if (ids.length === 0) return;
    await sql`
      UPDATE label_task_group g
      SET total_count = s.total,
          done_count = s.done,
          status = CASE WHEN s.total > 0 AND s.done = s.total
                        THEN ${sql.lit(TaskGroupStatus.DONE)}
                        ELSE ${sql.lit(TaskGroupStatus.RUNNING)} END,
          update_time = ${now}
      FROM (
        SELECT gg.id AS group_id,
               COUNT(t.id)::int AS total,
               COUNT(t.id) FILTER (WHERE t.status = ${sql.lit(TaskStatus.DONE)})::int AS done
        FROM label_task_group gg
        LEFT JOIN label_task t ON t.task_group_id = gg.id
        WHERE gg.id IN (${sql.join(ids)})
        GROUP BY gg.id
      ) s
      WHERE g.id = s.group_id AND g.type = ${sql.lit(TaskGroupType.PERSONAL)}
    `.execute(this.db);
  }

  async countMyTaskGroups(
    annotator: string,
    taskType: Maybe<number>,
    caseIds: readonly number[] | null,
  ): Promise<number> {
    const row = await this.withMyGroups(
      this.db.selectFrom('label_task_group').select(({ fn }) => fn.countAll<number>().as('n')),
      annotator,
      taskType,
      caseIds,
    ).executeTakeFirstOrThrow();
    return row.n;
  }

  /** 某成员的个人组，update_time、id 降序。 */
  selectMyTaskGroups(
    annotator: string,
    taskType: Maybe<number>,
    caseIds: readonly number[] | null,
    offset: number,
    limit: number,
  ): Promise<TaskGroupRow[]> {
    return this.withMyGroups(
      this.db.selectFrom('label_task_group').selectAll(),
      annotator,
      taskType,
      caseIds,
    )
      .orderBy('updateTime', 'desc')
      .orderBy('id', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();
  }

  async countTaskGroups(filter: TaskGroupFilter): Promise<number> {
    const row = await this.withFilter(
      this.db.selectFrom('label_task_group').select(({ fn }) => fn.countAll<number>().as('n')),
      filter,
    ).executeTakeFirstOrThrow();
    return row.n;
  }

  selectTaskGroups(
    filter: TaskGroupFilter,
    offset: number,
    limit: number,
  ): Promise<TaskGroupRow[]> {
    return this.withFilter(this.db.selectFrom('label_task_group').selectAll(), filter)
      .orderBy('updateTime', 'desc')
      .orderBy('id', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();
  }

  private withMyGroups<O>(
    query: GroupQuery<O>,
    annotator: string,
    taskType: Maybe<number>,
    caseIds: readonly number[] | null,
  ): GroupQuery<O> {
    let q = query.where('type', '=', TaskGroupType.PERSONAL).where('annotator', '=', annotator);
    if (taskType !== null && taskType !== undefined) q = q.where('stage', '=', taskType);
    if (caseIds !== null) q = q.where('caseId', 'in', [...caseIds]);
    return q;
  }

  private withFilter<O>(query: GroupQuery<O>, filter: TaskGroupFilter): GroupQuery<O> {
    let q = query;
    if (filter.caseId !== null && filter.caseId !== undefined) {
      q = q.where('caseId', '=', filter.caseId);
    }
    if (filter.type !== null && filter.type !== undefined) q = q.where('type', '=', filter.type);
    if (hasText(filter.labelToolCode)) q = q.where('labelToolCode', '=', filter.labelToolCode);
    if (filter.status !== null && filter.status !== undefined) {
      q = q.where('status', '=', filter.status);
    }
    if (hasText(filter.keyword)) {
      const pattern = likePattern(filter.keyword);
      q = q.where((eb) => eb.or([eb('annotator', 'ilike', pattern), eb('name', 'ilike', pattern)]));
    }
    return q;
  }
}

export interface TaskGroupFilter {
  caseId?: Maybe<number>;
  type?: Maybe<number>;
  keyword?: Maybe<string>;
  labelToolCode?: Maybe<string>;
  status?: Maybe<number>;
}
