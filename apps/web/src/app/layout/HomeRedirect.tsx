// 根路径 / 的角色化重定向。
// SA / LABEL_ADMIN → /dataset；标注员 / 审核员 → /my-groups；未登录由 RequireAuth 截获到 /login。
import { Navigate } from 'react-router-dom';
import { pickHomePath, useCurrentRoles } from '@/shared/auth/permissions';

export function HomeRedirect() {
  const perms = useCurrentRoles();
  return <Navigate to={pickHomePath(perms)} replace />;
}
