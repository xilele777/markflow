// user 接口函数（《接口层.md》§三）。路径 / 字段对齐《接口文档.md》三。
import { post, postPage } from '@/shared/api/http';
import type { PageResult } from '@/types/api';
import type {
  ChangePasswordRequest,
  CreateUserRequest,
  GetUserListRequest,
  UpdateUserStatusRequest,
  UserListItem,
} from './types';

/** 用户列表 · POST /api/user/getUserList（分页，系统管理员）。 */
export function getUserList(req: GetUserListRequest): Promise<PageResult<UserListItem>> {
  return postPage<UserListItem>('/user/getUserList', req);
}

/** 创建用户 · POST /api/user/create（系统管理员）。 */
export function createUser(req: CreateUserRequest): Promise<{ userId: number }> {
  return post<{ userId: number }>('/user/create', req);
}

/** 禁用 / 启用 · POST /api/user/updateStatus（系统管理员；不能禁用自己，M5）。 */
export function updateUserStatus(
  req: UpdateUserStatusRequest,
): Promise<{ userId: number; status: number }> {
  return post('/user/updateStatus', req);
}

/** 修改密码 · POST /api/user/changePassword（改当前登录用户自己的密码）。 */
export function changePassword(req: ChangePasswordRequest): Promise<void> {
  return post<void>('/user/changePassword', req);
}
