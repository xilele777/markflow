// workspace 接口函数（《接口层.md》§三）。路径 / 字段对齐《接口文档.md》四。
// 工作空间是全局资源（非空间内），用 post / postPage，不带 spaceCode。
import { post, postPage } from '@/shared/api/http';
import type { PageResult } from '@/types/api';
import type {
  AddWorkspaceMemberRequest,
  AddWorkspaceMemberResult,
  CreateWorkspaceRequest,
  GetWorkspaceListRequest,
  WorkspaceDetail,
  WorkspaceListItem,
} from './types';

/** 空间列表 · POST /api/workspace/getWorkspaceList（分页）。 */
export function getWorkspaceList(
  req: GetWorkspaceListRequest,
): Promise<PageResult<WorkspaceListItem>> {
  return postPage<WorkspaceListItem>('/workspace/getWorkspaceList', req);
}

/** 创建空间 · POST /api/workspace/createWorkspace（系统管理员）。 */
export function createWorkspace(req: CreateWorkspaceRequest): Promise<{ workspaceId: number }> {
  return post<{ workspaceId: number }>('/workspace/createWorkspace', req);
}

/** 空间详情 · POST /api/workspace/getWorkspaceDetail。 */
export function getWorkspaceDetail(workspaceId: number): Promise<WorkspaceDetail> {
  return post<WorkspaceDetail>('/workspace/getWorkspaceDetail', { workspaceId });
}

/** 添加空间成员 · POST /api/workspace/addWorkspaceMember（批量、局部成功）。 */
export function addWorkspaceMember(
  req: AddWorkspaceMemberRequest,
): Promise<AddWorkspaceMemberResult> {
  return post<AddWorkspaceMemberResult>('/workspace/addWorkspaceMember', req);
}
