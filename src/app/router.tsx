// 路由表（《工程结构.md》§四、《权限可见性.md》四）。
// 全屏路由（/login、/exec/*、/external/*）在壳外；其余在壳内。
// 权限：RequireRole 包高权页面；根 / 走 HomeRedirect 按角色挑首选入口。
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { RequireAuth } from './layout/RequireAuth';
import { RequireRole } from './layout/RequireRole';
import { HomeRedirect } from './layout/HomeRedirect';

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
import TaskProgressListPage from '@/features/taskgroup/pages/TaskProgressListPage';
import ContributionPage from '@/features/contribution/pages/ContributionPage';
import WorkspaceListPage from '@/features/workspace/pages/WorkspaceListPage';
import UserListPage from '@/features/user/pages/UserListPage';
import LabelToolListPage from '@/features/labeltool/pages/LabelToolListPage';
import AiConfigListPage from '@/features/aiconfig/pages/AiConfigListPage';
import LabelExecPage from '@/features/exec/pages/LabelExecPage';
import ReviewExecPage from '@/features/exec/pages/ReviewExecPage';
import EmbedLabelPage from '@/features/exec/pages/EmbedLabelPage';
import EmbedReviewPage from '@/features/exec/pages/EmbedReviewPage';
import LabelToolCreatePage from '@/features/labeltool/pages/LabelToolCreatePage';
// 临时：Puck 搭建验收沙盒（正式创建走 /labeltool/new；沙盒后续可删）。
import PuckDemo from '@/features/labeltool/puck/PuckDemo';
// 外部标注页面示范（模拟业务方独立项目；无 RequireAuth、无 AppShell）。
import SentimentLabelPage from '@/features/external/SentimentLabelPage';

export const router = createBrowserRouter([
  // 全屏 · 无壳
  { path: '/login', element: <LoginPage /> },

  // 外部标注页面示范（模拟业务方独立项目；无鉴权、无壳）。
  // 业务方真正接入时这是他们自己的工程；这里只为「同一项目内闭环演示」。
  { path: '/external/sentiment', element: <SentimentLabelPage /> },

  // 全屏 · 执行页（需登录、无壳）
  {
    element: <RequireAuth />,
    children: [
      // 标注 / 质检执行：由组归属 + 后端鉴权管，前端不强制角色守卫。
      { path: '/exec/label/:taskId', element: <LabelExecPage /> },
      { path: '/exec/review/:taskId', element: <ReviewExecPage /> },
      { path: '/embed/label/:taskId', element: <EmbedLabelPage /> },
      { path: '/embed/review/:taskId', element: <EmbedReviewPage /> },
      // 创建标注工具：仅 SA。
      {
        element: <RequireRole need={(p) => p.canViewLabelTool} />,
        children: [
          { path: '/labeltool/new', element: <LabelToolCreatePage /> },
          { path: '/labeltool/_demo', element: <PuckDemo /> },
        ],
      },
    ],
  },

  // 壳内（需登录）
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          // 根路径按角色挑首选入口（避免标注员 / 审核员被 hard 跳到 /dataset 然后又被守卫弹走）。
          { index: true, element: <HomeRedirect /> },

          // ① 数据资源管理（SA + LABEL_ADMIN）
          {
            element: <RequireRole need={(p) => p.canManageData} />,
            children: [
              { path: 'dataset', element: <DatasetListPage /> },
              { path: 'dataset/new', element: <DatasetNewPage /> },
              { path: 'dataset/:id', element: <DatasetDetailPage /> },
              { path: 'dataset/:id/version/new', element: <VersionNewPage /> },

              { path: 'case', element: <CaseListPage /> },
              { path: 'case/new', element: <CaseNewPage /> },
              { path: 'case/:id', element: <CaseDetailPage /> },
            ],
          },

          // ② 个人执行 / 通用任务组详情 / 我的贡献（全员可见）
          { path: 'my-groups', element: <MyGroupsPage /> },
          { path: 'my-groups/:gid', element: <GroupDetailPage /> },
          // 通用任务组详情入口：任务进度 / case 详情都跳这里；backTo 看 state.from。
          // /my-groups/:gid 保留为别名以维持「我的任务组」菜单选中态。
          { path: 'groups/:gid', element: <GroupDetailPage /> },
          // 我的贡献：/contribution 自查；/contribution?username=xxx 代查（后端兜底鉴权）。
          { path: 'contribution', element: <ContributionPage /> },

          // ③ 任务进度（仅 SA）
          {
            element: <RequireRole need={(p) => p.canViewTaskProgress} />,
            children: [{ path: 'task-progress', element: <TaskProgressListPage /> }],
          },

          // ④ 系统资源管理（仅 SA）
          {
            element: <RequireRole need={(p) => p.canManageSystem} />,
            children: [
              { path: 'workspace', element: <WorkspaceListPage /> },
              { path: 'user', element: <UserListPage /> },
            ],
          },

          // ⑤ 标注工具（仅 SA）
          {
            element: <RequireRole need={(p) => p.canViewLabelTool} />,
            children: [{ path: 'labeltool', element: <LabelToolListPage /> }],
          },

          // ⑥ AI 配置（SA + LABEL_ADMIN）
          {
            element: <RequireRole need={(p) => p.canViewAiConfig} />,
            children: [{ path: 'aiconfig', element: <AiConfigListPage /> }],
          },
        ],
      },
    ],
  },

  // 兜底
  { path: '*', element: <Navigate to="/" replace /> },
]);
