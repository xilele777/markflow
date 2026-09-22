// 路由表（《工程结构.md》§四、《权限可见性.md》四）。
// 全屏路由（/login、/exec/*、/external/*）在壳外；其余在壳内。
// 权限：RequireRole 包高权页面；根 / 走 HomeRedirect 按角色挑首选入口。
// 性能：所有页面按路由懒加载（React.lazy），Puck 相关页面（执行页 / 工具创建 / 沙盒）整体拆出主包；
//       登录页保持同步引入，保证首屏最快。
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AppShell } from './layout/AppShell';
import { RequireAuth } from './layout/RequireAuth';
import { RequireRole } from './layout/RequireRole';
import { HomeRedirect } from './layout/HomeRedirect';

import LoginPage from '@/features/auth/pages/LoginPage';

const DatasetListPage = lazy(() => import('@/features/dataset/pages/DatasetListPage'));
const DatasetDetailPage = lazy(() => import('@/features/dataset/pages/DatasetDetailPage'));
const DatasetNewPage = lazy(() => import('@/features/dataset/pages/DatasetNewPage'));
const VersionNewPage = lazy(() => import('@/features/dataset/pages/VersionNewPage'));
const CaseListPage = lazy(() => import('@/features/case/pages/CaseListPage'));
const CaseNewPage = lazy(() => import('@/features/case/pages/CaseNewPage'));
const CaseDetailPage = lazy(() => import('@/features/case/pages/CaseDetailPage'));
const MyGroupsPage = lazy(() => import('@/features/taskgroup/pages/MyGroupsPage'));
const GroupDetailPage = lazy(() => import('@/features/taskgroup/pages/GroupDetailPage'));
const TaskProgressListPage = lazy(() => import('@/features/taskgroup/pages/TaskProgressListPage'));
const ContributionPage = lazy(() => import('@/features/contribution/pages/ContributionPage'));
const WorkspaceListPage = lazy(() => import('@/features/workspace/pages/WorkspaceListPage'));
const UserListPage = lazy(() => import('@/features/user/pages/UserListPage'));
const LabelToolListPage = lazy(() => import('@/features/labeltool/pages/LabelToolListPage'));
const AiConfigListPage = lazy(() => import('@/features/aiconfig/pages/AiConfigListPage'));
const WebVitalsPage = lazy(() => import('@/features/monitoring/pages/WebVitalsPage'));
const NotificationListPage = lazy(
  () => import('@/features/notification/pages/NotificationListPage'),
);
// 执行页与内置工具页依赖 @measured/puck，按需加载。
const LabelExecPage = lazy(() => import('@/features/exec/pages/LabelExecPage'));
const ReviewExecPage = lazy(() => import('@/features/exec/pages/ReviewExecPage'));
const EmbedLabelPage = lazy(() => import('@/features/exec/pages/EmbedLabelPage'));
const EmbedReviewPage = lazy(() => import('@/features/exec/pages/EmbedReviewPage'));
const LabelToolCreatePage = lazy(() => import('@/features/labeltool/pages/LabelToolCreatePage'));
// 临时：Puck 搭建验收沙盒（正式创建走 /labeltool/new；沙盒后续可删）。
const PuckDemo = lazy(() => import('@/features/labeltool/puck/PuckDemo'));
// 外部标注页面示范（模拟业务方独立项目；无 RequireAuth、无 AppShell）。
const SentimentLabelPage = lazy(() => import('@/features/external/SentimentLabelPage'));

/** 懒加载页面的统一 fallback：居中 Spin（壳内壳外通用）。 */
function PageFallback() {
  return (
    <div style={{ flex: 1, minHeight: 240, display: 'grid', placeItems: 'center' }}>
      <Spin size="large" />
    </div>
  );
}

const suspend = (node: ReactNode) => <Suspense fallback={<PageFallback />}>{node}</Suspense>;

export const router = createBrowserRouter([
  // 全屏 · 无壳
  { path: '/login', element: <LoginPage /> },

  // 外部标注页面示范（模拟业务方独立项目；无鉴权、无壳）。
  // 业务方真正接入时这是他们自己的工程；这里只为「同一项目内闭环演示」。
  { path: '/external/sentiment', element: suspend(<SentimentLabelPage />) },

  // 全屏 · 执行页（需登录、无壳）
  {
    element: <RequireAuth />,
    children: [
      // 标注 / 质检执行：由组归属 + 后端鉴权管，前端不强制角色守卫。
      { path: '/exec/label/:taskId', element: suspend(<LabelExecPage />) },
      { path: '/exec/review/:taskId', element: suspend(<ReviewExecPage />) },
      { path: '/embed/label/:taskId', element: suspend(<EmbedLabelPage />) },
      { path: '/embed/review/:taskId', element: suspend(<EmbedReviewPage />) },
      // 创建标注工具：仅 SA。
      {
        element: <RequireRole need={(p) => p.canViewLabelTool} />,
        children: [
          { path: '/labeltool/new', element: suspend(<LabelToolCreatePage />) },
          { path: '/labeltool/_demo', element: suspend(<PuckDemo />) },
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
              { path: 'dataset', element: suspend(<DatasetListPage />) },
              { path: 'dataset/new', element: suspend(<DatasetNewPage />) },
              { path: 'dataset/:id', element: suspend(<DatasetDetailPage />) },
              { path: 'dataset/:id/version/new', element: suspend(<VersionNewPage />) },

              { path: 'case', element: suspend(<CaseListPage />) },
              { path: 'case/new', element: suspend(<CaseNewPage />) },
              { path: 'case/:id', element: suspend(<CaseDetailPage />) },
            ],
          },

          // ② 个人执行 / 通用任务组详情 / 我的贡献（全员可见）
          { path: 'my-groups', element: suspend(<MyGroupsPage />) },
          { path: 'my-groups/:gid', element: suspend(<GroupDetailPage />) },
          // 通用任务组详情入口：任务进度 / case 详情都跳这里；backTo 看 state.from。
          // /my-groups/:gid 保留为别名以维持「我的任务组」菜单选中态。
          { path: 'groups/:gid', element: suspend(<GroupDetailPage />) },
          // 我的贡献：/contribution 自查；/contribution?username=xxx 代查（后端兜底鉴权）。
          { path: 'contribution', element: suspend(<ContributionPage />) },
          // 通知中心（M5，全员）。
          { path: 'notifications', element: suspend(<NotificationListPage />) },

          // ③ 任务进度（仅 SA）
          {
            element: <RequireRole need={(p) => p.canViewTaskProgress} />,
            children: [{ path: 'task-progress', element: suspend(<TaskProgressListPage />) }],
          },

          // ④ 系统资源管理（仅 SA）
          {
            element: <RequireRole need={(p) => p.canManageSystem} />,
            children: [
              { path: 'workspace', element: suspend(<WorkspaceListPage />) },
              { path: 'user', element: suspend(<UserListPage />) },
              // 前端性能（Web Vitals 汇总）
              { path: 'monitoring/web-vitals', element: suspend(<WebVitalsPage />) },
            ],
          },

          // ⑤ 标注工具（仅 SA）
          {
            element: <RequireRole need={(p) => p.canViewLabelTool} />,
            children: [{ path: 'labeltool', element: suspend(<LabelToolListPage />) }],
          },

          // ⑥ AI 配置（SA + LABEL_ADMIN）
          {
            element: <RequireRole need={(p) => p.canViewAiConfig} />,
            children: [{ path: 'aiconfig', element: suspend(<AiConfigListPage />) }],
          },
        ],
      },
    ],
  },

  // 兜底
  { path: '*', element: <Navigate to="/" replace /> },
]);
