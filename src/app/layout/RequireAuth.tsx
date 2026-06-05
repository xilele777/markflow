// RequireAuth —— 登录闸：未登录跳 /login（《接口层.md》：鉴权失效跳登录）。
// 注：这是「是否登录」的闸，不是角色显隐；角色显隐本期「先不过滤全显」（见 nav.ts TODO）。
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/auth';

export function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
