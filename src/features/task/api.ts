// task 接口函数（《接口层.md》§三）。路径 / 字段对齐《接口文档.md》九。
// 全部按 taskId 显式定位，不走 postScoped。
import { post } from '@/shared/api/http';
import type {
  SampleDataResponse,
  SaveTaskResultRequest,
  SubmitReviewTaskRequest,
  TaskDetail,
  TaskResultResponse,
} from './types';

/** 任务详情 · POST /api/task/getTaskDetail。 */
export function getTaskDetail(taskId: number): Promise<TaskDetail> {
  return post<TaskDetail>('/task/getTaskDetail', { taskId });
}

/** 获取样本数据 · POST /api/task/getSampleData。 */
export function getSampleData(taskId: number): Promise<SampleDataResponse> {
  return post<SampleDataResponse>('/task/getSampleData', { taskId });
}

/** 获取任务结果 · POST /api/task/getTaskResult（sampleType：1=标注 2=质检）。 */
export function getTaskResult(taskId: number, sampleType: number): Promise<TaskResultResponse> {
  return post<TaskResultResponse>('/task/getTaskResult', { taskId, sampleType });
}

/** 保存任务结果 · POST /api/task/saveTaskResult（透传不校验）。 */
export function saveTaskResult(req: SaveTaskResultRequest): Promise<void> {
  return post<void>('/task/saveTaskResult', req);
}

/** 提交标注任务 · POST /api/task/submitLabelTask（后端校验已存结果）。 */
export function submitLabelTask(taskId: number): Promise<void> {
  return post<void>('/task/submitLabelTask', { taskId });
}

/** 提交质检任务 · POST /api/task/submitReviewTask（reviewAction：0=驳回 1=通过）。 */
export function submitReviewTask(req: SubmitReviewTaskRequest): Promise<void> {
  return post<void>('/task/submitReviewTask', req);
}
