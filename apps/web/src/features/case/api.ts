// case 接口函数（typed 纯函数，《接口层.md》§三）。路径 / 字段对齐《接口文档.md》八。
// case 是空间内资源：列表 / 创建 走 postScoped(Page) 自动带 spaceCode；详情按 caseId 定位用 post。
import { post, postScoped, postScopedPage } from '@/shared/api/http';
import type { PageResult } from '@/types/api';
import type {
  CaseDetail,
  CaseListItem,
  CreateCaseRequest,
  CreateCaseResponse,
  ExportCaseRequest,
  GetCaseListRequest,
  UpdateCaseDeadlineRequest,
  UpdateCaseStatusRequest,
} from './types';

/** Case 列表 · POST /api/case/getCaseList（空间内，分页）。 */
export function getCaseList(req: GetCaseListRequest): Promise<PageResult<CaseListItem>> {
  return postScopedPage<CaseListItem>('/case/getCaseList', req);
}

/** Case 详情 · POST /api/case/getCaseDetail（按 caseId 定位，无 spaceCode）。 */
export function getCaseDetail(caseId: number): Promise<CaseDetail> {
  return post<CaseDetail>('/case/getCaseDetail', { caseId });
}

/** 创建 Case · POST /api/case/createCase（空间内）。 */
export function createCase(req: CreateCaseRequest): Promise<CreateCaseResponse> {
  return postScoped<CreateCaseResponse>('/case/createCase', req);
}

/** 触发结果导出 · POST /api/case/exportCaseResult（异步，仅系统管理员 / 空间 LABEL_ADMIN）。
 *  接口立即返回；实际渲染 + 上传 TOS 在后端 MQ 消费侧异步执行，
 *  状态写入 case.ext.lastExport，前端通过 getCaseDetail 拉取。 */
export function exportCaseResult(req: ExportCaseRequest): Promise<void> {
  return post<void>('/case/exportCaseResult', req);
}

/** 状态控制 · POST /api/case/updateCaseStatus（暂停 / 恢复 / 结束；系统管理员或空间 LABEL_ADMIN，M5）。 */
export function updateCaseStatus(
  req: UpdateCaseStatusRequest,
): Promise<{ caseId: number; status: number }> {
  return post('/case/updateCaseStatus', req);
}

/** 截止时间 · POST /api/case/updateCaseDeadline（deadline=null 清除，M5）。 */
export function updateCaseDeadline(
  req: UpdateCaseDeadlineRequest,
): Promise<{ caseId: number; deadline: number | null }> {
  return post('/case/updateCaseDeadline', req);
}
