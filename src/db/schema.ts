// Kysely 表类型（11 张表，对应后端索引 §5 / 迁移 0001_init）。
// 属性为 camelCase（CamelCasePlugin 自动映射到 snake_case 列）；表名保持 snake_case。
// 时间统一毫秒 number；jsonb 列查询得对象、写入须 JSON.stringify（避免 pg 把数组序列化成 PG 数组）。
import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

type JsonNullable<T = unknown> = ColumnType<T | null, string | null, string | null>;

interface AuditColumns {
  creator: string | null;
  operator: string | null;
  createTime: number;
  updateTime: number;
}

export interface SysUserTable extends AuditColumns {
  id: Generated<number>;
  username: string;
  displayName: string;
  passwordHash: string;
  isSystemAdmin: boolean;
  /** UserStatus：0 NORMAL / 1 DISABLED */
  status: number;
}

export interface WorkspaceTable extends AuditColumns {
  id: Generated<number>;
  spaceCode: string;
  name: string;
  description: string | null;
}

export interface UserWorkspaceShipTable {
  id: Generated<number>;
  workspaceId: number;
  userId: number;
  /** WorkspaceRole：1 LABELER / 2 REVIEWER / 3 LABEL_ADMIN */
  roleInSpace: number;
  creator: string | null;
  createTime: number;
}

export interface SysConfigTable extends AuditColumns {
  id: Generated<number>;
  configKey: string;
  configName: string;
  /** SysConfigType：1 STRING / 2 JSON / 3 YAML / 4 CLASS_PATH */
  type: number;
  content: string | null;
  description: string | null;
  deleted: Generated<number>;
}

export interface LingshuLabelToolTable extends AuditColumns {
  id: Generated<number>;
  labelToolCode: string;
  labelToolName: string;
  /** 1 BUILTIN / 2 IFRAME */
  labelToolType: number;
  labelToolUrl: string | null;
  labelToolJsonSchema: JsonNullable;
  labelToolPageSchema: JsonNullable;
  deleted: Generated<number>;
  ext: JsonNullable;
}

export interface LingshuDatasetTable extends AuditColumns {
  id: Generated<number>;
  spaceCode: string;
  datasetName: string;
  datasetDesc: string | null;
  /** 1 ANNOTATION / 2 STREAM_ANNOTATION / 3 RESULT */
  datasetType: number;
  /** = labelToolCode */
  serviceObjName: string | null;
  latestVersionNumber: Generated<number>;
  deleted: Generated<number>;
  ext: JsonNullable;
}

export interface LingshuDatasetVersionTable extends AuditColumns {
  id: Generated<number>;
  datasetId: number;
  versionNumber: number;
  versionDesc: string | null;
  ossPath: string | null;
  /** 1 PARSING / 2 READY / 3 PARSE_FAILED */
  uploadStatus: number;
  sampleCount: Generated<number>;
  deleted: Generated<number>;
  ext: JsonNullable;
}

export interface LingshuDatasetSampleTable extends AuditColumns {
  id: Generated<number>;
  datasetVersionId: number;
  bizId: string | null;
  sampleDataJson: JsonNullable;
  deleted: Generated<number>;
  ext: JsonNullable;
}

export interface LabelCaseTable extends AuditColumns {
  id: Generated<number>;
  spaceCode: string;
  name: string;
  description: string | null;
  /** 1 DATASET / 2 STREAM */
  dataSourceType: number;
  datasetVersionId: number | null;
  labelResultDatasetVersionId: number | null;
  labelToolCode: string;
  taskPlanConfig: JsonNullable;
  assignmentConfig: JsonNullable;
  /** 1 NOT_STARTED / 2 RUNNING / 3 PAUSED / 4 FINISHED */
  status: number;
  version: Generated<number>;
  deleted: Generated<number>;
  ext: JsonNullable;
}

export interface LabelTaskGroupTable {
  id: Generated<number>;
  caseId: number;
  /** 阶段 1–5 */
  stage: number;
  /** 1 PERSONAL / 2..6 各阶段池 */
  type: number;
  /** 个人组 = username 或 aiCode；池 = null */
  annotator: string | null;
  name: string | null;
  labelToolCode: string | null;
  /** 1 PENDING / 2 RUNNING / 3 DONE */
  status: number;
  totalCount: Generated<number>;
  doneCount: Generated<number>;
  costTime: Generated<number>;
  ext: JsonNullable;
  createTime: number;
  updateTime: number;
}

export interface LabelTaskTable {
  id: Generated<number>;
  caseId: number;
  taskGroupId: number;
  taskGroupSeq: Generated<number>;
  /** 1 AI_LABEL / 2 LABEL / 3 AI_REVIEW / 4 FIRST_CHECK / 5 RECHECK */
  taskType: number;
  /** 1 PENDING_DISPATCH / 2 LABELING / 3 REVIEWING / 4 DONE / 5 REWORK */
  status: number;
  round: Generated<number>;
  dataSampleId: number;
  bizId: string | null;
  annotator: string | null;
  claimTime: number | null;
  costTime: number | null;
  ext: JsonNullable;
  operator: string | null;
  createTime: number;
  updateTime: number;
}

/** 事务内写入、提交后投递的消息（迁移 0003）。payload 为 jsonb（写入 JSON.stringify）。 */
export interface MqOutboxTable {
  id: Generated<number>;
  queue: string;
  jobName: string;
  jobId: string | null;
  payload: ColumnType<unknown, string, string>;
  /** 1 PENDING */
  status: Generated<number>;
  attempts: Generated<number>;
  nextRetryTime: number;
  lastError: string | null;
  createTime: number;
  updateTime: number;
}

/** 前端 Core Web Vitals 样本（迁移 0004）。value：ms 取整，CLS 为 ×1000 取整。 */
export interface WebVitalsTable {
  id: Generated<number>;
  name: string;
  value: number;
  rating: string | null;
  page: string | null;
  navigationType: string | null;
  metricId: string | null;
  createTime: number;
}

export interface Database {
  sys_user: SysUserTable;
  workspace: WorkspaceTable;
  user_workspace_ship: UserWorkspaceShipTable;
  sys_config: SysConfigTable;
  lingshu_label_tool: LingshuLabelToolTable;
  lingshu_dataset: LingshuDatasetTable;
  lingshu_dataset_version: LingshuDatasetVersionTable;
  lingshu_dataset_sample: LingshuDatasetSampleTable;
  label_case: LabelCaseTable;
  label_task_group: LabelTaskGroupTable;
  label_task: LabelTaskTable;
  mq_outbox: MqOutboxTable;
  web_vitals: WebVitalsTable;
}

export type SysUserRow = Selectable<SysUserTable>;
export type NewSysUser = Insertable<SysUserTable>;
export type SysUserUpdate = Updateable<SysUserTable>;
export type WorkspaceRow = Selectable<WorkspaceTable>;
export type UserWorkspaceShipRow = Selectable<UserWorkspaceShipTable>;
export type NewWorkspace = Insertable<WorkspaceTable>;
export type NewUserWorkspaceShip = Insertable<UserWorkspaceShipTable>;
export type LabelToolRow = Selectable<LingshuLabelToolTable>;
export type NewLabelTool = Insertable<LingshuLabelToolTable>;
export type DatasetRow = Selectable<LingshuDatasetTable>;
export type NewDataset = Insertable<LingshuDatasetTable>;
export type DatasetVersionRow = Selectable<LingshuDatasetVersionTable>;
export type NewDatasetVersion = Insertable<LingshuDatasetVersionTable>;
export type DatasetSampleRow = Selectable<LingshuDatasetSampleTable>;
export type NewDatasetSample = Insertable<LingshuDatasetSampleTable>;
export type CaseRow = Selectable<LabelCaseTable>;
export type NewCase = Insertable<LabelCaseTable>;
export type TaskGroupRow = Selectable<LabelTaskGroupTable>;
export type NewTaskGroup = Insertable<LabelTaskGroupTable>;
export type TaskRow = Selectable<LabelTaskTable>;
export type NewTask = Insertable<LabelTaskTable>;
export type MqOutboxRow = Selectable<MqOutboxTable>;
export type NewMqOutbox = Insertable<MqOutboxTable>;
export type WebVitalsRow = Selectable<WebVitalsTable>;
export type NewWebVitals = Insertable<WebVitalsTable>;
