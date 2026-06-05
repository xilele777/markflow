// Sidebar —— 左侧导航（《菜单栏.md》）。宽 224、白底 + 右侧 hairline；三段：品牌 / 菜单 / 空间切换器。
// 纯文字无图标、平铺不折叠、灰字分组、选中蓝 accent bar。
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Dropdown } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { palette, fonts, sizing } from '@/app/theme';
import { useWorkspaceStore } from '@/shared/store/workspace';
import { useAuthStore } from '@/shared/store/auth';
import { getCurrentUser } from '@/features/auth/api';
import { BrandMark } from './BrandMark';
import { NAV, matchNav } from './nav';

function Brand() {
  return (
    <div style={{ padding: '20px 20px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <BrandMark size={22} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span
          style={{
            fontFamily: fonts.display,
            fontWeight: 700,
            fontSize: 17,
            color: palette.text,
            letterSpacing: '-0.01em',
          }}
        >
          灵枢
        </span>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 9.5,
            letterSpacing: '0.18em',
            color: palette.weak,
            marginTop: 2,
          }}
        >
          LINGSHU
        </span>
      </div>
    </div>
  );
}

function WorkspaceSwitcher() {
  const { spaceCode, workspaces, setSpace, setWorkspaces } = useWorkspaceStore();
  const setUser = useAuthStore((s) => s.setUser);

  // 切换空间后实时刷新当前用户（角色 / 空间可能随上下文变化）。
  const refreshUser = useMutation({
    mutationFn: getCurrentUser,
    onSuccess: (me) => {
      setUser(me);
      setWorkspaces(me.workspaces);
    },
  });

  const onSelectSpace = (key: string) => {
    if (key === '__none__' || key === spaceCode) return;
    setSpace(key);
    refreshUser.mutate();
  };

  const current = workspaces.find((w) => w.spaceCode === spaceCode);
  const name = current?.name ?? '未选择空间';
  const code = current?.spaceCode ?? '—';

  const items =
    workspaces.length > 0
      ? workspaces.map((w) => ({ key: w.spaceCode, label: `${w.name}（${w.spaceCode}）` }))
      : [{ key: '__none__', label: '暂无可切换空间', disabled: true }];

  return (
    <div style={{ padding: 12, borderTop: `1px solid ${palette.border}` }}>
      <Dropdown
        trigger={['click']}
        menu={{
          items,
          selectable: true,
          selectedKeys: spaceCode ? [spaceCode] : [],
          onClick: ({ key }) => onSelectSpace(key),
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 10px',
            borderRadius: sizing.radius,
            border: `1px solid ${palette.border}`,
            background: palette.surface,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: sizing.radius - 1,
              flex: 'none',
              background: palette.fill,
              display: 'grid',
              placeItems: 'center',
              fontFamily: fonts.display,
              fontWeight: 700,
              fontSize: 13,
              color: palette.accent,
            }}
          >
            {name.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: palette.text,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {name}
            </div>
            <div style={{ fontFamily: fonts.mono, fontSize: 10, color: palette.weak }}>{code}</div>
          </div>
          <DownOutlined style={{ fontSize: 11, color: palette.sub }} />
        </div>
      </Dropdown>
    </div>
  );
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { item: activeItem } = matchNav(location.pathname);

  return (
    <aside
      style={{
        width: sizing.sidebarWidth,
        flex: 'none',
        background: palette.surface,
        borderRight: `1px solid ${palette.hairline}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Brand />

      <nav style={{ flex: 1, padding: '6px 12px', overflowY: 'auto' }}>
        {NAV.map((g) => (
          <div key={g.group} style={{ marginBottom: 18 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.04em',
                color: palette.weak,
                padding: '0 10px 7px',
              }}
            >
              {g.group}
            </div>
            {g.items.map((it) => {
              const active = activeItem?.path === it.path;
              return (
                <div
                  key={it.path}
                  onClick={() => navigate(it.path)}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    height: 34,
                    padding: '0 10px',
                    borderRadius: sizing.radius,
                    marginBottom: 2,
                    background: active ? palette.activeBg : 'transparent',
                    color: palette.text,
                    fontSize: 13.5,
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {active && (
                    <span
                      style={{
                        position: 'absolute',
                        left: -12,
                        top: 7,
                        bottom: 7,
                        width: 3,
                        borderRadius: 2,
                        background: palette.accent,
                      }}
                    />
                  )}
                  {it.label}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <WorkspaceSwitcher />
    </aside>
  );
}
