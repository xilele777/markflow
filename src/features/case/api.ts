// case 接口函数（typed 纯函数，《接口层.md》§三）。路径 / 字段对齐《接口文档.md》八。
// case 是空间内资源：列表 / 创建 走 postScoped(Page) 自动带 spaceCode；详情按 caseId 定位用 post。
import { post, postScoped, postScopedPage } from '@/shared/api/http';
import type { PageResult } from '@/types/api';
import type {
  CaseDetail,
  CaseListItem,
  CreateCaseRequest,
  CreateCaseResponse,
  GetCaseListRequest,
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
