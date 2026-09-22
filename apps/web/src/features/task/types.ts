// task 模块类型。对齐《接口文档.md》九（任务样本/结果/提交）。
import type { StageType } from '@/features/case/types';

/** labelTool（getTaskDetail 嵌套）。 */
export interface TaskDetailLabelTool {
  labelToolCode: string;
  labelToolName: string;
  /** 1=内置(Puck) 2=IFRAME。 */
  labelToolType: number;
  /** IFRAME 工具地址（内置工具可能为空）。 */
  labelToolUrl: string;
  /** 内置工具的 Puck Data Structure；IFRAME 工具可为空。 */
  labelToolPageSchema: Record<string, unknown> | null;
}

/** getTaskDetail 出参。 */
export interface TaskDetail {
  taskId: number;
  caseId: number;
  /** task 类型码：1=AI标 2=人工标 3=AI审 4=人工初检 5=人工复检。 */
  taskType: number;
  stageType: StageType;
  /** task 状态：1=待分配 2=标注中 3=质检中 4=已完成 5=打回重标中。 */
  status: number;
  round: number;
  bizId: string | null;
  /** 执行人 username 或 aiCode。 */
  annotator: string | null;
  claimTime: number | null;
  labelTool: TaskDetailLabelTool;
}

/** getSampleData 出参。 */
export interface SampleDataResponse {
  taskId: number;
  bizId: string | null;
  /** 原始样本内容（JSON）。 */
  sampleData: Record<string, unknown>;
}

/** getTaskResult 出参。无结果时 hasResult=false、result=null。 */
export interface TaskResultResponse {
  taskId: number;
  /** 1=标注结果 2=质检结果。 */
  sampleType: number;
  hasResult: boolean;
  result: Record<string, unknown> | null;
}

/** saveTaskResult 入参（透传不校验）。 */
export interface SaveTaskResultRequest {
  taskId: number;
  /** 1=标注结果 2=质检结果。 */
  sampleType: number;
  result: Record<string, unknown>;
}

/** submitReviewTask 入参（通过/驳回打回上阶段）。 */
export interface SubmitReviewTaskRequest {
  taskId: number;
  /** 0=驳回 1=通过。 */
  reviewAction: number;
  reviewComment?: string;
}
