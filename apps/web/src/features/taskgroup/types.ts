// taskgroup / task 模块类型。对齐《接口文档.md》九 + 十。
import type { PageRequest } from '@/types/api';

/** 我的任务组列表元素（getMyTaskGroups.list[]）。 */
export interface MyTaskGroupItem {
  taskGroupId: number;
  caseId: number;
  caseName: string;
  spaceCode: string;
  /** task 类型码（STAGE_TYPE 1-5）。 */
  taskType: number;
  /** 组名。 */
  name: string;
  /** 标注工具编码。 */
  labelTool: string;
  /** 组状态：1=待执行, 2=执行中, 3=已完成（TASK_GROUP_STATUS）。 */
  status: number;
  createTime: number;
  updateTime: number;
}

export interface GetMyTaskGroupsRequest extends PageRequest {
  /** 空间过滤。 */
  spaceCode?: string;
  /** task 类型过滤（1-5）。 */
  taskType?: number;
}

/** 任务组内任务列表元素（getTaskListInGroup.list[]）。 */
export interface TaskGroupTaskItem {
  taskId: number;
  taskType: number;
  /** 业务 id（可能为 null —— 实测后端返回 null）。 */
  bizId: string | null;
  taskGroupSeq: number;
  /** task 状态：1=待分配 2=标注中 3=质检中 4=已完成 5=打回重标中（TASK_STATUS）。 */
  status: number;
  /** 重标轮次（>1 表示已打回重做过）。 */
  round: number;
  /** 领取时刻；未领取为 0/null。 */
  claimTime: number | null;
  createTime: number;
  updateTime: number;
}

export interface GetTaskListInGroupRequest extends PageRequest {
  taskGroupId: number;
  status?: number;
}

// ─── 任务进度（管理员视角） · getTaskGroupList ──────────────────────────────
// 比「我的任务组」多出来：type（任务组类型 1-6）、annotator（执行人/AI 编码或 null）。

/** 任务组类型（接口附录「任务组类型 type」）。1=个人组 2=AI预标池 3=人工标注池 4=AI预审池 5=初检池 6=复检池。 */
export type TaskGroupType = 1 | 2 | 3 | 4 | 5 | 6;

/** 任务组列表元素（getTaskGroupList.list[]）。 */
export interface TaskGroupItem {
  taskGroupId: number;
  caseId: number;
  caseName: string;
  spaceCode: string;
  /** stage 编号（STAGE_TYPE 1-5）—— 任务组归属的阶段。 */
  taskType: number;
  /** 任务组类型（TASK_GROUP_TYPE 1-6）—— 个人组 / 各种池。 */
  type: number;
  /** 个人组执行人 username / aiCode；池子时 null。 */
  annotator: string | null;
  name: string;
  /** 标注工具编码。 */
  labelTool: string;
  /** 组状态：1=待执行 2=执行中 3=已完成（TASK_GROUP_STATUS）。 */
  status: number;
  createTime: number;
  updateTime: number;
}

export interface GetTaskGroupListRequest extends PageRequest {
  /** 按 case 过滤；不传则全量。 */
  caseId?: number;
  /** 按任务组类型 1-6 过滤；不传则全部。 */
  type?: number;
  /** 关键词，模糊匹配 annotator 或 name。 */
  keyword?: string;
  /** 按标注工具编码精确过滤。 */
  labelToolCode?: string;
  /** 组状态 1-3 过滤。 */
  status?: number;
}
