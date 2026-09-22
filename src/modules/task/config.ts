// label_case.task_plan_config / assignment_config / ext 与 label_task.ext 的结构与取值辅助
// （对应 Java TaskPlanConfig / AssignmentConfig / CaseExt；规则表 0004 §0）。
// jsonb 读出即对象；这里只做形状容错（缺失字段为 null / 未知字段忽略），不做业务校验（校验在 case.service）。
import type { CaseExportStatusName, StageDef, StageTypeName } from './enums.js';
import { stageByType, STAGES } from './enums.js';

export interface StageItem {
  /** 规范 stage 编号（= type 的 code，1-5）。 */
  stage: number;
  type: StageTypeName;
}

export interface TaskPlanConfig {
  stages: StageItem[];
}

export interface AiStageConfig {
  aiCode: string | null;
  preDispatchSize: number | null;
  autoRecycleMinutes: number | null;
}

export interface MemberConfig {
  username: string | null;
  /** 固定分配 0-100；FCFS 为 null。 */
  ratio: number | null;
  /** 缺省视为 true。 */
  active: boolean | null;
}

export interface HumanStageConfig {
  /** 1 FCFS / 2 FIXED_RATIO。 */
  strategy: number | null;
  preDispatchSize: number | null;
  autoRecycleMinutes: number | null;
  members: MemberConfig[] | null;
}

export interface AssignmentConfig {
  aiPreLabel: AiStageConfig | null;
  label: HumanStageConfig | null;
  aiPreReview: AiStageConfig | null;
  review: HumanStageConfig | null;
  recheck: HumanStageConfig | null;
}

export interface LastExport {
  status: CaseExportStatusName;
  format: string;
  objectKey?: string;
  /** 不落库；getCaseDetail 时按 objectKey 现签。 */
  downloadUrl?: string;
  triggerTime?: number;
  finishTime?: number;
  failureReason?: string;
}

export interface CaseExt {
  lastExport?: LastExport;
  /** 截止时间（毫秒）；null 表示清除。 */
  deadline?: number | null;
  /** 截止前提醒已发出的时间；重设 deadline 时清零。 */
  deadlineReminderAt?: number | null;
  /** 逾期通知已发出的时间；重设 deadline 时清零。 */
  deadlineOverdueAt?: number | null;
}

/** AI 执行失败记录（规则表 6.9）。 */
export interface AiFailure {
  code: string;
  message: string;
  attempts: number;
  retryable: boolean;
  failedAt: number;
}

export interface TaskExt {
  aiFailure?: AiFailure | null;
  [key: string]: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

export function readTaskPlan(raw: unknown): TaskPlanConfig | null {
  if (!isRecord(raw) || !Array.isArray(raw['stages'])) return null;
  const stages: StageItem[] = [];
  for (const item of raw['stages']) {
    if (!isRecord(item)) continue;
    const def = stageByType(item['type']);
    if (def) stages.push({ stage: def.code, type: def.type });
  }
  return { stages };
}

export function readAiStage(raw: unknown): AiStageConfig | null {
  if (!isRecord(raw)) return null;
  return {
    aiCode: strOrNull(raw['aiCode']),
    preDispatchSize: intOrNull(raw['preDispatchSize']),
    autoRecycleMinutes: intOrNull(raw['autoRecycleMinutes']),
  };
}

export function readHumanStage(raw: unknown): HumanStageConfig | null {
  if (!isRecord(raw)) return null;
  const members = Array.isArray(raw['members'])
    ? raw['members'].map((m): MemberConfig => {
        const obj = isRecord(m) ? m : {};
        return {
          username: strOrNull(obj['username']),
          ratio: intOrNull(obj['ratio']),
          active: boolOrNull(obj['active']),
        };
      })
    : null;
  return {
    strategy: intOrNull(raw['strategy']),
    preDispatchSize: intOrNull(raw['preDispatchSize']),
    autoRecycleMinutes: intOrNull(raw['autoRecycleMinutes']),
    members,
  };
}

export function readAssignment(raw: unknown): AssignmentConfig | null {
  if (!isRecord(raw)) return null;
  return {
    aiPreLabel: readAiStage(raw['aiPreLabel']),
    label: readHumanStage(raw['label']),
    aiPreReview: readAiStage(raw['aiPreReview']),
    review: readHumanStage(raw['review']),
    recheck: readHumanStage(raw['recheck']),
  };
}

export function readCaseExt(raw: unknown): CaseExt {
  if (!isRecord(raw)) return {};
  const ext: CaseExt = {};
  const le = raw['lastExport'];
  if (isRecord(le) && typeof le['status'] === 'string') {
    const out: LastExport = {
      status: le['status'] as CaseExportStatusName,
      format: typeof le['format'] === 'string' ? le['format'] : '',
    };
    if (typeof le['objectKey'] === 'string') out.objectKey = le['objectKey'];
    if (typeof le['triggerTime'] === 'number') out.triggerTime = le['triggerTime'];
    if (typeof le['finishTime'] === 'number') out.finishTime = le['finishTime'];
    if (typeof le['failureReason'] === 'string') out.failureReason = le['failureReason'];
    ext.lastExport = out;
  }
  if (typeof raw['deadline'] === 'number') ext.deadline = raw['deadline'];
  if (typeof raw['deadlineReminderAt'] === 'number') {
    ext.deadlineReminderAt = raw['deadlineReminderAt'];
  }
  if (typeof raw['deadlineOverdueAt'] === 'number')
    ext.deadlineOverdueAt = raw['deadlineOverdueAt'];
  return ext;
}

export function readTaskExt(raw: unknown): TaskExt {
  return isRecord(raw) ? { ...raw } : {};
}

/** 取某 AI stage 的配置；非 AI stage 返回 null。 */
export function aiConfigOf(assignment: AssignmentConfig | null, stage: StageDef) {
  if (!assignment) return null;
  if (stage.type === 'aiPreLabel') return assignment.aiPreLabel;
  if (stage.type === 'aiPreReview') return assignment.aiPreReview;
  return null;
}

/** 取某人工 stage 的配置；非人工 stage 返回 null。 */
export function humanConfigOf(assignment: AssignmentConfig | null, stage: StageDef) {
  if (!assignment) return null;
  if (stage.type === 'label') return assignment.label;
  if (stage.type === 'review') return assignment.review;
  if (stage.type === 'recheck') return assignment.recheck;
  return null;
}

/** 自动回收超时分钟数（AI / 人工统一）；未配置为 null（该 stage 不回收）。 */
export function autoRecycleMinutesOf(
  assignment: AssignmentConfig | null,
  stage: StageDef,
): number | null {
  const cfg = stage.ai ? aiConfigOf(assignment, stage) : humanConfigOf(assignment, stage);
  return cfg ? cfg.autoRecycleMinutes : null;
}

/** 成员是否启用：active 缺省（null）视为 true。 */
export function isMemberActive(member: MemberConfig): boolean {
  return member.active !== false;
}

/** plan 的阶段定义列表（按配置顺序）。 */
export function planStages(plan: TaskPlanConfig | null): StageDef[] {
  if (!plan) return [];
  return plan.stages.map((s) => stageByType(s.type)).filter((s): s is StageDef => s !== undefined);
}

export function nextStageInPlan(plan: TaskPlanConfig | null, current: StageDef): StageDef | null {
  const stages = planStages(plan);
  const idx = stages.findIndex((s) => s.type === current.type);
  return idx < 0 || idx === stages.length - 1 ? null : (stages[idx + 1] ?? null);
}

export function prevStageInPlan(plan: TaskPlanConfig | null, current: StageDef): StageDef | null {
  const stages = planStages(plan);
  const idx = stages.findIndex((s) => s.type === current.type);
  return idx <= 0 ? null : (stages[idx - 1] ?? null);
}

/** 某 stage 当前的执行者列表：AI → [aiCode]；人工 → active 成员 username（配置顺序）。 */
export function activeExecutors(assignment: AssignmentConfig | null, stage: StageDef): string[] {
  if (stage.ai) {
    const ai = aiConfigOf(assignment, stage);
    return ai?.aiCode ? [ai.aiCode] : [];
  }
  const human = humanConfigOf(assignment, stage);
  if (!human?.members) return [];
  return human.members
    .filter((m) => isMemberActive(m) && typeof m.username === 'string')
    .map((m) => m.username as string);
}

/** 执行者在该 stage 是否仍 active（驳回时决定留组还是回池）；用户名比较大小写不敏感（annotator 列为 citext）。 */
export function isExecutorActiveInStage(
  assignment: AssignmentConfig | null,
  stage: StageDef,
  executor: string | null,
): boolean {
  if (!assignment || !executor) return false;
  if (stage.ai) {
    const ai = aiConfigOf(assignment, stage);
    return ai?.aiCode !== null && ai?.aiCode !== undefined && sameName(ai.aiCode, executor);
  }
  const human = humanConfigOf(assignment, stage);
  const member = human?.members?.find((m) => m.username !== null && sameName(m.username, executor));
  return member !== undefined && isMemberActive(member);
}

export function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export { STAGES };
