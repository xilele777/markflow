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
