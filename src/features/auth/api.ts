// auth 接口函数（typed 纯函数，《接口层.md》§三）。函数名与后端接口同名。
// 路径 / 字段对齐《接口文档.md》二、三（公开 /api/auth；当前用户 /api/user/getCurrentUser）。
import { post } from '@/shared/api/http';
import type { LoginRequest, LoginResponse, CurrentUser } from './types';

/** 登录 · POST /api/auth/login。拿 token。 */
export function login(req: LoginRequest): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', req);
}

/** 当前用户 · POST /api/user/getCurrentUser。拿 user + workspaces + roles（供菜单 / 操作显隐）。 */
export function getCurrentUser(): Promise<CurrentUser> {
  return post<CurrentUser>('/user/getCurrentUser', {});
}
