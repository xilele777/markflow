// taskgroup / task 接口函数（《接口层.md》§三）。路径 / 字段对齐《接口文档.md》九 + 十。
// 「我的任务组」与组内任务列表都按 caller 显式传 spaceCode / taskGroupId 定位，不走 postScoped。
import { postPage } from '@/shared/api/http';
import type { PageResult } from '@/types/api';
import type {
  GetMyTaskGroupsRequest,
  GetTaskListInGroupRequest,
  MyTaskGroupItem,
  TaskGroupTaskItem,
} from './types';

/** 我的任务组列表 · POST /api/taskgroup/getMyTaskGroups（分页）。 */
export function getMyTaskGroups(
  req: GetMyTaskGroupsRequest,
): Promise<PageResult<MyTaskGroupItem>> {
  return postPage<MyTaskGroupItem>('/taskgroup/getMyTaskGroups', req);
}

/** 任务组内任务列表 · POST /api/task/getTaskListInGroup（分页）。 */
export function getTaskListInGroup(
  req: GetTaskListInGroupRequest,
): Promise<PageResult<TaskGroupTaskItem>> {
  return postPage<TaskGroupTaskItem>('/task/getTaskListInGroup', req);
}
