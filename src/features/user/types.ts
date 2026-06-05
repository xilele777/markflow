// user 模块类型。对齐《接口文档.md》三。
import type { PageRequest } from '@/types/api';

/** getUserList 出参元素。 */
export interface UserListItem {
  userId: number;
  username: string;
  displayName: string;
  isSystemAdmin: boolean;
  /** 0=正常 1=禁用（USER_STATUS）。 */
  status: number;
  createTime: number;
}

export interface GetUserListRequest extends PageRequest {
  /** 模糊匹配 username / displayName。 */
  keyword?: string;
}

/** createUser 入参（《接口文档.md》三）。 */
export interface CreateUserRequest {
  username: string;
  displayName: string;
  password: string;
  isSystemAdmin?: boolean;
}

/** changePassword 入参（改当前登录用户自己的密码）。 */
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}
