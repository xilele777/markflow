// auth 接口函数（typed 纯函数，《接口层.md》§三）。函数名与后端接口同名。
// 路径 / 方法 / 字段对齐《接口文档.md》二、三（登录 POST /api/auth/login；当前用户 GET /api/user/getCurrentUser）。
import { post, get } from '@/shared/api/http';
import type { LoginRequest, LoginResponse, CurrentUser } from './types';

/** 登录 · POST /api/auth/login。拿 token。 */
export function login(req: LoginRequest): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', req);
}

/** 当前用户 · GET /api/user/getCurrentUser。拿 user + workspaces + roles（供菜单 / 操作显隐）。 */
export function getCurrentUser(): Promise<CurrentUser> {
  return get<CurrentUser>('/user/getCurrentUser');
}
