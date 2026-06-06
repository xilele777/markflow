// RequireAuth —— 登录闸：未登录跳 /login（《接口层.md》：鉴权失效跳登录）。
// 已有 token 但 user 还没水合（如刷新页面：token 持久化、user/workspaces 不持久化）→ 启动补拉 getCurrentUser，
// 否则左下角空间切换器会因 workspaces=[] 而空。401 由 http 层清 token + 跳登录。
// 注：这是「是否登录」的闸，不是角色显隐；角色显隐本期「先不过滤全显」（见 nav.ts TODO）。
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Spin } from 'antd';
import { useAuthStore } from '@/shared/store/auth';
import { refreshCurrentUser } from '@/features/auth/session';

export function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  // 有 token 但还没 user（刷新页面后）→ 拉一次当前用户，水合 user + 可切换空间。
  const { isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: refreshCurrentUser,
    enabled: !!token && !user,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!user && isLoading) {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }
  return <Outlet />;
}
