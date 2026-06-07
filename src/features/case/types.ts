// case 模块类型。对齐《接口文档.md》八。
import type { PageRequest } from '@/types/api';

/** stage 类型（camelCase，对齐 STAGE_TYPE code 1-5）。 */
export type StageType = 'aiPreLabel' | 'label' | 'aiPreReview' | 'review' | 'recheck';

export const STAGE_TYPE_CODE: Record<StageType, number> = {
  aiPreLabel: 1,
  label: 2,
  aiPreReview: 3,
  review: 4,
  recheck: 5,
};

export const STAGE_ORDER: StageType[] = ['aiPreLabel', 'label', 'aiPreReview', 'review', 'recheck'];

/** taskPlanConfig：流程编排。 */
export interface TaskPlanConfig {
  stages: { stage: number; type: StageType }[];
}

/** AI 阶段配置（aiPreLabel / aiPreReview）。 */
export interface AiStageConfig {
  aiCode: string;
  preDispatchSize: number;
  autoRecycleMinutes: number;
}

/** 人工阶段成员条目。 */
export interface StageMember {
  username: string;
  /** 固定分配时 0-100；先到先得时为 null。 */
  ratio: number | null;
  active: boolean;
}

/** 人工阶段配置（label / review / recheck）。 */
export interface HumanStageConfig {
  /** 1=先到先得, 2=固定分配。 */
  strategy: number;
  preDispatchSize: number;
  autoRecycleMinutes: number;
  members: StageMember[];
}

/** assignmentConfig：按 stage type 拆分。AI 用 AiStageConfig，人工用 HumanStageConfig。 */
export interface AssignmentConfig {
  aiPreLabel?: AiStageConfig;
  label?: HumanStageConfig;
  aiPreReview?: AiStageConfig;
  review?: HumanStageConfig;
  recheck?: HumanStageConfig;
}

/** getCaseList 出参元素。 */
export interface CaseListItem {
  caseId: number;
  name: string;
  description: string;
  /** 1=数据集, 2=流式（DATA_SOURCE_TYPE）。 */
  dataSourceType: number;
  /** 1=未启动, 2=运行中, 3=已暂停, 4=已结束（CASE_STATUS）。 */
  status: number;
  labelToolCode: string;
  creator: string;
  createTime: number;
}

export interface GetCaseListRequest extends PageRequest {
  /** 任务状态过滤；不传则全部。 */
  status?: number;
  /** 任务名模糊匹配。 */
  keyword?: string;
}

/** stageProgress 元素。 */
export interface StageProgress {
  stageType: StageType;
  /** 1-5。 */
  taskType: number;
  poolPending: number;
  personalDoing: number;
  done: number;
}

/** 结果导出格式（exportCaseResult 入参 / ext.lastExport.format）。 */
export type ExportFormat = 'csv' | 'jsonl';

/** ext.lastExport.status —— 异步导出状态机。 */
export type LastExportStatus = 'EXPORTING' | 'DONE' | 'FAILED';

/** 最近一次结果导出（覆盖式更新）。NON_NULL 序列化，缺失字段整体省略：
 *   - DONE：有 objectKey / downloadUrl / finishTime，没有 failureReason
 *   - FAILED：有 failureReason / finishTime，没有 downloadUrl
 *   - EXPORTING：只有 status / format / triggerTime
 */
export interface LastExport {
  status: LastExportStatus;
  format: ExportFormat;
  triggerTime: number;
  finishTime?: number;
  objectKey?: string;
  downloadUrl?: string;
  failureReason?: string;
}

/** case.ext —— 业务扩展字段袋。整个 ext 当前可能不存在（未触发过任何 ext 业务时）。 */
export interface CaseExt {
  lastExport?: LastExport;
}

/** getCaseDetail 出参。 */
export interface CaseDetail {
  caseId: number;
  spaceCode: string;
  name: string;
  description: string;
  dataSourceType: number;
  datasetVersionId: number | null;
  labelToolCode: string;
  status: number;
  creator: string;
  createTime: number;
  updateTime: number;
  taskPlanConfig: TaskPlanConfig;
  assignmentConfig: AssignmentConfig;
  /** 结果集版本 id（首次写结果时 lazy 创建，可能为 null）。 */
  labelResultDatasetVersionId: number | null;
  stageProgress: StageProgress[];
  /** 扩展字段。未触发过结果导出 / 未来其它 ext 业务时整个字段缺省。 */
  ext?: CaseExt | null;
}

/** exportCaseResult 入参。 */
export interface ExportCaseRequest {
  caseId: number;
  format: ExportFormat;
}

/** createCase 入参。 */
export interface CreateCaseRequest {
  name: string;
  description?: string;
  /** 1=数据集, 2=流式。 */
  dataSourceType: number;
  /** 数据集模式必填。 */
  datasetVersionId?: number;
  labelTool: string;
  taskPlanConfig: TaskPlanConfig;
  assignmentConfig: AssignmentConfig;
}

export interface CreateCaseResponse {
  caseId: number;
}
