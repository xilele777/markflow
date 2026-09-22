// 测试辅助：直接落库造 case / 任务组 / 任务 / 样本（M1 只用于「我的贡献」统计；M3 起有正式接口后可替换）。
import type { AppContext } from '../../src/app/context.js';
import { TaskGroupStatus, TaskGroupType } from '../../src/modules/task/enums.js';

const CASE_RUNNING = 2;
const DATA_SOURCE_DATASET = 1;

export async function insertCase(
  ctx: AppContext,
  input: {
    spaceCode: string;
    name: string;
    labelToolCode: string;
    labelResultDatasetVersionId?: number | null;
  },
): Promise<number> {
  const now = Date.now();
  const row = await ctx.db
    .insertInto('label_case')
    .values({
      spaceCode: input.spaceCode,
      name: input.name,
      description: null,
      dataSourceType: DATA_SOURCE_DATASET,
      datasetVersionId: null,
      labelResultDatasetVersionId: input.labelResultDatasetVersionId ?? null,
      labelToolCode: input.labelToolCode,
      taskPlanConfig: null,
      assignmentConfig: null,
      status: CASE_RUNNING,
      ext: null,
      creator: 'test',
      operator: 'test',
      createTime: now,
      updateTime: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function insertPersonalGroup(
  ctx: AppContext,
  input: { caseId: number; stage: number; annotator: string },
): Promise<number> {
  const now = Date.now();
  const row = await ctx.db
    .insertInto('label_task_group')
    .values({
      caseId: input.caseId,
      stage: input.stage,
      type: TaskGroupType.PERSONAL,
      annotator: input.annotator,
      name: `group-${input.stage}-${input.annotator}`,
      labelToolCode: null,
      status: TaskGroupStatus.RUNNING,
      ext: null,
      createTime: now,
      updateTime: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

export interface InsertTaskInput {
  caseId: number;
  taskGroupId: number;
  taskType: number;
  status: number;
  dataSampleId: number;
  annotator: string | null;
  round?: number;
  costTime?: number | null;
  claimTime?: number | null;
  updateTime?: number;
}

export async function insertTask(ctx: AppContext, input: InsertTaskInput): Promise<number> {
  const now = Date.now();
  const row = await ctx.db
    .insertInto('label_task')
    .values({
      caseId: input.caseId,
      taskGroupId: input.taskGroupId,
      taskType: input.taskType,
      status: input.status,
      round: input.round ?? 1,
      dataSampleId: input.dataSampleId,
      bizId: String(input.dataSampleId),
      annotator: input.annotator,
      claimTime: input.claimTime ?? null,
      costTime: input.costTime ?? null,
      ext: null,
      operator: input.annotator,
      createTime: now,
      updateTime: input.updateTime ?? now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function insertSample(
  ctx: AppContext,
  input: { datasetVersionId: number; bizId: string | null; sampleData: unknown },
): Promise<number> {
  const now = Date.now();
  const row = await ctx.db
    .insertInto('lingshu_dataset_sample')
    .values({
      datasetVersionId: input.datasetVersionId,
      bizId: input.bizId,
      sampleDataJson: JSON.stringify(input.sampleData),
      deleted: 0,
      ext: null,
      creator: 'test',
      operator: 'test',
      createTime: now,
      updateTime: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}
