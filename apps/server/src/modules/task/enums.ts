// 任务域枚举（后端索引 §4.1）。M1 只用于「我的贡献」统计；M3 派发引擎 / case / task 全部沿用。
import { WorkspaceRole, type WorkspaceRoleCode } from '../workspace/enums.js';

/** TaskTypeEnum：AI_LABEL=1, LABEL=2, AI_REVIEW=3, FIRST_CHECK=4, RECHECK=5；code ≤ 2 为标注类。 */
export const TaskType = {
  AI_LABEL: 1,
  LABEL: 2,
  AI_REVIEW: 3,
  FIRST_CHECK: 4,
  RECHECK: 5,
} as const;
export type TaskTypeCode = (typeof TaskType)[keyof typeof TaskType];

export function isTaskTypeCode(code: unknown): code is TaskTypeCode {
  return typeof code === 'number' && code >= 1 && code <= 5 && Number.isInteger(code);
}

/** 标注类 task（AI 预标 / 人工标注）走 submitLabelTask；其余走 submitReviewTask。 */
export function isAnnotationTaskType(code: number): boolean {
  return code <= TaskType.LABEL;
}

/** TaskStatusEnum：PENDING_DISPATCH=1, LABELING=2, REVIEWING=3, DONE=4, REWORK=5。 */
export const TaskStatus = {
  PENDING_DISPATCH: 1,
  LABELING: 2,
  REVIEWING: 3,
  DONE: 4,
  REWORK: 5,
} as const;
export type TaskStatusCode = (typeof TaskStatus)[keyof typeof TaskStatus];

export function isTaskStatusCode(code: unknown): code is TaskStatusCode {
  return typeof code === 'number' && code >= 1 && code <= 5 && Number.isInteger(code);
}

/** 「在手中」= 标注中 / 质检中 / 打回重标中。 */
export const IN_HAND_STATUSES: readonly number[] = [
  TaskStatus.LABELING,
  TaskStatus.REVIEWING,
  TaskStatus.REWORK,
];

/** 池内可派 = 待分配 / 打回重标中。 */
export const POOL_STATUSES: readonly number[] = [TaskStatus.PENDING_DISPATCH, TaskStatus.REWORK];

/** TaskGroupTypeEnum：PERSONAL=1，2..6 为各阶段池。 */
export const TaskGroupType = {
  PERSONAL: 1,
  AI_PRE_LABEL_POOL: 2,
  LABEL_POOL: 3,
  AI_PRE_REVIEW_POOL: 4,
  REVIEW_POOL: 5,
  RECHECK_POOL: 6,
} as const;
export type TaskGroupTypeCode = (typeof TaskGroupType)[keyof typeof TaskGroupType];

export const TASK_GROUP_TYPE_DESC: Record<number, string> = {
  1: '个人组',
  2: 'AI预标池',
  3: '人工标注池',
  4: 'AI预审池',
  5: '初检池',
  6: '复检池',
};

export function isTaskGroupTypeCode(code: unknown): code is TaskGroupTypeCode {
  return typeof code === 'number' && code >= 1 && code <= 6 && Number.isInteger(code);
}

export const POOL_TYPE_MIN = 2;
export const POOL_TYPE_MAX = 6;

/** TaskGroupStatusEnum：PENDING=1, RUNNING=2, DONE=3。 */
export const TaskGroupStatus = { PENDING: 1, RUNNING: 2, DONE: 3 } as const;
export type TaskGroupStatusCode = (typeof TaskGroupStatus)[keyof typeof TaskGroupStatus];

export function isTaskGroupStatusCode(code: unknown): code is TaskGroupStatusCode {
  return code === 1 || code === 2 || code === 3;
}

/** CaseStatusEnum：NOT_STARTED=1, RUNNING=2, PAUSED=3, FINISHED=4（M3 只会写 RUNNING）。 */
export const CaseStatus = { NOT_STARTED: 1, RUNNING: 2, PAUSED: 3, FINISHED: 4 } as const;
export type CaseStatusCode = (typeof CaseStatus)[keyof typeof CaseStatus];

export function isCaseStatusCode(code: unknown): code is CaseStatusCode {
  return code === 1 || code === 2 || code === 3 || code === 4;
}

/** DataSourceTypeEnum：DATASET=1, STREAM=2（M3 拒绝 STREAM，规则表 1.11）。 */
export const DataSourceType = { DATASET: 1, STREAM: 2 } as const;
export type DataSourceTypeCode = (typeof DataSourceType)[keyof typeof DataSourceType];

export function isDataSourceTypeCode(code: unknown): code is DataSourceTypeCode {
  return code === 1 || code === 2;
}

/** StrategyEnum：FCFS=1, FIXED_RATIO=2。 */
export const Strategy = { FCFS: 1, FIXED_RATIO: 2 } as const;
export type StrategyCode = (typeof Strategy)[keyof typeof Strategy];

export function isStrategyCode(code: unknown): code is StrategyCode {
  return code === 1 || code === 2;
}

/** ReviewActionEnum：REJECT=0, PASS=1。 */
export const ReviewAction = { REJECT: 0, PASS: 1 } as const;
export type ReviewActionCode = (typeof ReviewAction)[keyof typeof ReviewAction];

export function isReviewActionCode(code: unknown): code is ReviewActionCode {
  return code === 0 || code === 1;
}

/** SampleTypeEnum：ANNOTATION=1（标注结果）, REVIEW=2（质检结果）。 */
export const SampleType = { ANNOTATION: 1, REVIEW: 2 } as const;
export type SampleTypeCode = (typeof SampleType)[keyof typeof SampleType];

export function isSampleTypeCode(code: unknown): code is SampleTypeCode {
  return code === 1 || code === 2;
}

/** CaseExportStatusEnum（JSON 存枚举名）。 */
export const CaseExportStatus = {
  EXPORTING: 'EXPORTING',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const;
export type CaseExportStatusName = (typeof CaseExportStatus)[keyof typeof CaseExportStatus];

export const EXPORT_FORMATS = ['csv', 'jsonl'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * StageTypeEnum：配置串 camelCase；code 同时是 task.task_type 与 group.stage；poolType 为对应池的 group.type。
 * 人工阶段带所需空间角色。
 */
export const StageType = {
  AI_PRE_LABEL: 'aiPreLabel',
  LABEL: 'label',
  AI_PRE_REVIEW: 'aiPreReview',
  REVIEW: 'review',
  RECHECK: 'recheck',
} as const;
export type StageTypeName = (typeof StageType)[keyof typeof StageType];

export interface StageDef {
  type: StageTypeName;
  code: TaskTypeCode;
  poolType: TaskGroupTypeCode;
  ai: boolean;
  requiredRole: WorkspaceRoleCode | null;
}

export const STAGES: readonly StageDef[] = [
  { type: 'aiPreLabel', code: 1, poolType: 2, ai: true, requiredRole: null },
  { type: 'label', code: 2, poolType: 3, ai: false, requiredRole: WorkspaceRole.LABELER },
  { type: 'aiPreReview', code: 3, poolType: 4, ai: true, requiredRole: null },
  { type: 'review', code: 4, poolType: 5, ai: false, requiredRole: WorkspaceRole.REVIEWER },
  { type: 'recheck', code: 5, poolType: 6, ai: false, requiredRole: WorkspaceRole.REVIEWER },
];

export function stageByType(type: unknown): StageDef | undefined {
  return STAGES.find((s) => s.type === type);
}

export function stageByCode(code: unknown): StageDef | undefined {
  return STAGES.find((s) => s.code === code);
}

export function stageByPoolType(poolType: unknown): StageDef | undefined {
  return STAGES.find((s) => s.poolType === poolType);
}

export function requireStageByCode(code: number): StageDef {
  const stage = stageByCode(code);
  if (!stage) throw new Error(`未知的 stage code: ${code}`);
  return stage;
}
