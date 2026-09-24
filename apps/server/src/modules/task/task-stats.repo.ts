// 「我的贡献」聚合查询（对应 Java TaskMapper.xml 的 aggregateByAnnotator / selectAnnotatorScope /
// selectLabelerVerdict / selectReviewerVerdict / selectAnnotatorDailyDone），MySQL 方言改写为 PostgreSQL：
// JSON_EXTRACT → ->>、CAST AS CHAR → ::varchar、FROM_UNIXTIME/DATE_FORMAT → to_timestamp/AT TIME ZONE/to_char。
// SUM(bigint) 在 PG 为 numeric（pg 驱动返回字符串），统一 ::bigint 让 int8 解析器转成 number。
import { sql } from 'kysely';
import type { Db } from '../../infra/db.js';
import { TaskStatus, TaskType } from './enums.js';

export interface AnnotatorTaskAggRow {
  taskType: number;
  status: number;
  cnt: number;
  /** round > 1 的条数（被打回过）。 */
  reboundCnt: number;
  /** 仅 status=DONE 行的 cost_time 之和。 */
  doneCostSum: number;
  /** 分组内 update_time 最大值。 */
  lastUpdateTime: number | null;
}

export interface AnnotatorScopeRow {
  caseCount: number;
  labelToolCount: number;
}

/** 通过率投影：reviewed = 已有质检结果的数；passed = 其中当前 reviewAction=1 的数（覆盖式语义）。 */
export interface AnnotatorVerdictRow {
  reviewed: number;
  passed: number;
}

export interface AnnotatorDailyDoneRow {
  /** yyyy-MM-dd */
  day: string;
  cnt: number;
}

export class TaskStatsRepository {
  constructor(private readonly db: Db) {}

  /** 按 (task_type, status) 聚合某 annotator 的 task。 */
  aggregateByAnnotator(annotator: string): Promise<AnnotatorTaskAggRow[]> {
    return this.db
      .selectFrom('label_task')
      .select(({ fn }) => [
        'taskType',
        'status',
        fn.countAll<number>().as('cnt'),
        sql<number>`COALESCE(SUM(CASE WHEN round > 1 THEN 1 ELSE 0 END), 0)::bigint`.as(
          'reboundCnt',
        ),
        sql<number>`COALESCE(SUM(CASE WHEN status = ${TaskStatus.DONE} THEN COALESCE(cost_time, 0) ELSE 0 END), 0)::bigint`.as(
          'doneCostSum',
        ),
        fn.max('updateTime').as('lastUpdateTime'),
      ])
      .where('annotator', '=', annotator)
      .groupBy(['taskType', 'status'])
      .execute();
  }

  /** 参与过的 case 数 + 标注工具种类数。 */
  selectAnnotatorScope(annotator: string): Promise<AnnotatorScopeRow> {
    return this.db
      .selectFrom('label_task as t')
      .innerJoin('label_case as c', 'c.id', 't.caseId')
      .select([
        sql<number>`COUNT(DISTINCT t.case_id)`.as('caseCount'),
        sql<number>`COUNT(DISTINCT c.label_tool_code)`.as('labelToolCount'),
      ])
      .where('t.annotator', '=', annotator)
      .executeTakeFirstOrThrow();
  }

  /** 标注员通过率：完成的 label task → 标注结果 sample → 质检结果 sample 的 reviewAction。 */
  selectLabelerVerdict(annotator: string): Promise<AnnotatorVerdictRow> {
    return this.selectVerdict(annotator, [TaskType.LABEL]);
  }

  /** 质检员通过率：完成的 review/recheck task，同样沿标注结果 → 质检结果链路取当前结论。 */
  selectReviewerVerdict(annotator: string): Promise<AnnotatorVerdictRow> {
    return this.selectVerdict(annotator, [TaskType.FIRST_CHECK, TaskType.RECHECK]);
  }

  /**
   * 串联键（后端索引 §5）：标注结果 sample.biz_id = String(源 dataSampleId)；质检结果 sample.biz_id = String(标注结果 sample.id)。
   * 不用 task.biz_id 串联（Java 版该列恒为 null）。
   */
  private selectVerdict(annotator: string, taskTypes: number[]): Promise<AnnotatorVerdictRow> {
    return this.db
      .selectFrom('label_task as t')
      .innerJoin('label_case as c', 'c.id', 't.caseId')
      .innerJoin('markflow_dataset_sample as ls', (join) =>
        join
          .onRef('ls.datasetVersionId', '=', 'c.labelResultDatasetVersionId')
          .on(sql<boolean>`ls.biz_id = t.data_sample_id::varchar`)
          .on('ls.deleted', '=', 0),
      )
      .innerJoin('markflow_dataset_sample as rs', (join) =>
        join
          .onRef('rs.datasetVersionId', '=', 'c.labelResultDatasetVersionId')
          .on(sql<boolean>`rs.biz_id = ls.id::varchar`)
          .on('rs.deleted', '=', 0),
      )
      .select([
        sql<number>`COUNT(rs.id)`.as('reviewed'),
        sql<number>`COALESCE(SUM(CASE WHEN rs.sample_data_json->>'reviewAction' = '1' THEN 1 ELSE 0 END), 0)::bigint`.as(
          'passed',
        ),
      ])
      .where('t.annotator', '=', annotator)
      .where('t.taskType', 'in', taskTypes)
      .where('t.status', '=', TaskStatus.DONE)
      .where('c.labelResultDatasetVersionId', 'is not', null)
      .executeTakeFirstOrThrow();
  }

  /** 按天（给定时区）聚合完成数（status=DONE，update_time ≥ sinceMillis），day 升序。 */
  selectAnnotatorDailyDone(
    annotator: string,
    sinceMillis: number,
    timeZone: string,
  ): Promise<AnnotatorDailyDoneRow[]> {
    // 时区作为绑定参数；GROUP BY / ORDER BY 引用输出列别名，避免 PG 把两个占位符视为不同表达式。
    const day = sql<string>`to_char(to_timestamp(update_time::double precision / 1000) AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
    return this.db
      .selectFrom('label_task')
      .select(({ fn }) => [day.as('day'), fn.countAll<number>().as('cnt')])
      .where('annotator', '=', annotator)
      .where('status', '=', TaskStatus.DONE)
      .where('updateTime', '>=', sinceMillis)
      .groupBy('day')
      .orderBy('day')
      .execute();
  }
}
