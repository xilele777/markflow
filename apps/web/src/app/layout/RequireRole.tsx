// 路由守卫：按角色保护页面。无权 → 重定向到当前用户的首选入口（pickHomePath）。
// 用法：<Route element={<RequireRole need={(p) => p.canManageData} />}><Route .../></Route>
// 区分于 RequireAuth：RequireAuth 只保证已登录；RequireRole 进一步检查角色。
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { pickHomePath, useCurrentRoles, type CurrentRoles } from '@/shared/auth/permissions';

interface Props {
  /** 通过条件；返回 true 才放行。 */
  need: (p: CurrentRoles) => boolean;
}

export function RequireRole({ need }: Props) {
  const perms = useCurrentRoles();
  const location = useLocation();
  if (!need(perms)) {
    // 重定向到首选入口；带上 from 方便 debug，不强求页面读取。
    return <Navigate to={pickHomePath(perms)} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
