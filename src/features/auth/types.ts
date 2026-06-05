// auth 模块类型。字段对齐后端（camelCase）。
// TODO(接口契约): 登录 / 当前用户的真实请求·响应字段以后端《接口文档.md》为准，拿到后替换。
import type { CurrentUser } from '@/shared/store/auth';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}

export type { CurrentUser };
