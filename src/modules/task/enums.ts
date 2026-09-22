// 任务域枚举（后端索引 §4.1）。M1 只用于「我的贡献」统计；M3 派发引擎沿用。

/** TaskTypeEnum：AI_LABEL=1, LABEL=2, AI_REVIEW=3, FIRST_CHECK=4, RECHECK=5；code ≤ 2 为标注类。 */
export const TaskType = {
  AI_LABEL: 1,
  LABEL: 2,
  AI_REVIEW: 3,
  FIRST_CHECK: 4,
  RECHECK: 5,
} as const;
export type TaskTypeCode = (typeof TaskType)[keyof typeof TaskType];

/** TaskStatusEnum：PENDING_DISPATCH=1, LABELING=2, REVIEWING=3, DONE=4, REWORK=5。 */
export const TaskStatus = {
  PENDING_DISPATCH: 1,
  LABELING: 2,
  REVIEWING: 3,
  DONE: 4,
  REWORK: 5,
} as const;
export type TaskStatusCode = (typeof TaskStatus)[keyof typeof TaskStatus];

/** 「在手中」= 标注中 / 质检中 / 打回重标中。 */
export const IN_HAND_STATUSES: readonly number[] = [
  TaskStatus.LABELING,
  TaskStatus.REVIEWING,
  TaskStatus.REWORK,
];

/** TaskGroupTypeEnum：PERSONAL=1，2..6 为各阶段池。 */
export const TaskGroupType = {
  PERSONAL: 1,
  AI_PRE_LABEL_POOL: 2,
  LABEL_POOL: 3,
  AI_PRE_REVIEW_POOL: 4,
  REVIEW_POOL: 5,
  RECHECK_POOL: 6,
} as const;

/** TaskGroupStatusEnum：PENDING=1, RUNNING=2, DONE=3。 */
export const TaskGroupStatus = { PENDING: 1, RUNNING: 2, DONE: 3 } as const;
