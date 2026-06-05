// 路由表（《工程结构.md》§四）。
// 全屏路由（/login、/exec/*）在壳外；其余在壳内。未实现页面用占位组件。
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { RequireAuth } from './layout/RequireAuth';

import LoginPage from '@/features/auth/pages/LoginPage';
import DatasetListPage from '@/features/dataset/pages/DatasetListPage';
import DatasetDetailPage from '@/features/dataset/pages/DatasetDetailPage';
import DatasetNewPage from '@/features/dataset/pages/DatasetNewPage';
import VersionNewPage from '@/features/dataset/pages/VersionNewPage';
import CaseListPage from '@/features/case/pages/CaseListPage';
import CaseNewPage from '@/features/case/pages/CaseNewPage';
import CaseDetailPage from '@/features/case/pages/CaseDetailPage';
import MyGroupsPage from '@/features/taskgroup/pages/MyGroupsPage';
import GroupDetailPage from '@/features/taskgroup/pages/GroupDetailPage';
import WorkspaceListPage from '@/features/workspace/pages/WorkspaceListPage';
import UserListPage from '@/features/user/pages/UserListPage';
import LabelToolListPage from '@/features/labeltool/pages/LabelToolListPage';
import AiConfigListPage from '@/features/aiconfig/pages/AiConfigListPage';
import LabelExecPage from '@/features/exec/pages/LabelExecPage';
import ReviewExecPage from '@/features/exec/pages/ReviewExecPage';

export const router = createBrowserRouter([
  // 全屏 · 无壳
  { path: '/login', element: <LoginPage /> },

  // 全屏 · 执行页（需登录、无壳）
  {
    element: <RequireAuth />,
    children: [
      { path: '/exec/label/:taskId', element: <LabelExecPage /> },
      { path: '/exec/review/:taskId', element: <ReviewExecPage /> },
    ],
  },

  // 壳内（需登录）
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dataset" replace /> },

          { path: 'dataset', element: <DatasetListPage /> },
          { path: 'dataset/new', element: <DatasetNewPage /> },
          { path: 'dataset/:id', element: <DatasetDetailPage /> },
          { path: 'dataset/:id/version/new', element: <VersionNewPage /> },

          { path: 'case', element: <CaseListPage /> },
          { path: 'case/new', element: <CaseNewPage /> },
          { path: 'case/:id', element: <CaseDetailPage /> },

          { path: 'my-groups', element: <MyGroupsPage /> },
          { path: 'my-groups/:gid', element: <GroupDetailPage /> },

          { path: 'workspace', element: <WorkspaceListPage /> },
          { path: 'user', element: <UserListPage /> },
          { path: 'labeltool', element: <LabelToolListPage /> },
          { path: 'aiconfig', element: <AiConfigListPage /> },
        ],
      },
    ],
  },

  // 兜底
  { path: '*', element: <Navigate to="/" replace /> },
]);
