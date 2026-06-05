// workspace 模块类型。对齐《接口文档.md》四。
import type { PageRequest } from '@/types/api';

/** getWorkspaceList 出参元素。 */
export interface WorkspaceListItem {
  workspaceId: number;
  spaceCode: string;
  name: string;
  description: string;
  createTime: number;
}

export interface GetWorkspaceListRequest extends PageRequest {
  /** 按空间名模糊匹配。 */
  keyword?: string;
}

/** createWorkspace 入参。 */
export interface CreateWorkspaceRequest {
  spaceCode: string;
  name: string;
  description?: string;
}

/** 空间成员（getWorkspaceDetail.members[]）。roles 为角色码 1/2/3。 */
export interface WorkspaceMember {
  userId: number;
  username: string;
  displayName: string;
  /** 0=正常 1=禁用（USER_STATUS）。 */
  status: number;
  roles: number[];
}

/** getWorkspaceDetail 出参。 */
export interface WorkspaceDetail {
  workspaceId: number;
  spaceCode: string;
  name: string;
  description: string;
  createTime: number;
  members: WorkspaceMember[];
}

/** addWorkspaceMember 入参（批量；roles 为角色码）。 */
export interface AddWorkspaceMemberRequest {
  workspaceId: number;
  members: { userId: number; roles: number[] }[];
}

/** addWorkspaceMember 出参（局部成功）。 */
export interface AddWorkspaceMemberResult {
  successCount: number;
  failures: { userId: number; username: string; reason: string }[];
}
