// AppShell —— 侧栏 + 顶栏 + 内容容器（《组件清单.md》一、《页面模板.md》全局布局）。
// 壳内路由渲染在 <Outlet/>；内容区内边距 22–28、区块间距 16。
import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';
import { palette } from '@/app/theme';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  return (
    // hasSider：Sidebar 是自定义 <aside>（非 AntD Sider），需显式让外层 Layout 走横向布局，
    // 否则默认 flex-direction:column 会把侧栏撑满高度、把顶栏+内容挤到屏幕外。
    <Layout hasSider style={{ height: 'var(--app-vh)', background: palette.canvas }}>
      <Sidebar />
      <Layout style={{ minWidth: 0 }}>
        <Topbar />
        <Layout.Content
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '22px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
