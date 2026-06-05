// Topbar —— 顶栏（《组件清单.md》一、《菜单栏.md》五）。高 56。
// 左：面包屑（无页面大标题）；右：版本号(mono weak) + 头像(退出 / 修改密码)。
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Breadcrumb, Dropdown } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { palette, fonts, sizing } from '@/app/theme';
import { useAuthStore } from '@/shared/store/auth';
import { useWorkspaceStore } from '@/shared/store/workspace';
import { toast } from '@/shared/components';
import { matchNav } from './nav';

// TODO: 版本号接真实构建信息（import.meta.env / 接口）。
const APP_VERSION = 'v0.9.2';

export function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const clearWorkspace = useWorkspaceStore((s) => s.clear);

  const { group, item } = matchNav(location.pathname);
  const crumbs = [group?.group, item?.label].filter(Boolean) as string[];

  const onLogout = () => {
    clearAuth();
    clearWorkspace();
    navigate('/login');
  };

  return (
    <header
      style={{
        height: sizing.topbarHeight,
        flex: 'none',
        background: palette.surface,
        borderBottom: `1px solid ${palette.hairline}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
      }}
    >
      <Breadcrumb
        items={crumbs.map((c) => ({ title: c }))}
        style={{ fontSize: 13, fontFamily: fonts.body }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontFamily: fonts.mono, fontSize: 11.5, color: palette.weak }}>
          {APP_VERSION}
        </span>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'pwd', label: '修改密码' },
              { type: 'divider' },
              { key: 'logout', label: '退出登录' },
            ],
            onClick: ({ key }) => {
              if (key === 'logout') onLogout();
              // TODO: 修改密码弹窗（《工程结构.md》：头像菜单内弹窗，不单独占路由）。
              if (key === 'pwd') toast.info('修改密码：待实现');
            },
          }}
        >
          <Avatar
            size={30}
            style={{ cursor: 'pointer', background: palette.fill, color: palette.sub }}
            icon={!user?.displayName ? <UserOutlined /> : undefined}
          >
            {user?.displayName?.charAt(0)}
          </Avatar>
        </Dropdown>
      </div>
    </header>
  );
}
