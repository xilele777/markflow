// 顶栏铃铛（M5）：轮询未读数（30s）+ 角标；点击进通知中心。
// 与通知列表页共用 ['notification', ...] 查询前缀，标记已读后角标随之刷新。
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BellOutlined } from '@ant-design/icons';
import { palette, fonts, sizing } from '@/app/theme';
import { getUnreadCount } from '../api';
import { badgeText } from '../format';

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['notification', 'unread'],
    queryFn: getUnreadCount,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
  const text = badgeText(data?.unread ?? 0);

  return (
    <button
      type="button"
      aria-label={text ? `通知（${text} 条未读）` : '通知'}
      data-testid="notification-bell"
      data-unread={data?.unread ?? 0}
      onClick={() => navigate('/notifications')}
      style={{
        position: 'relative',
        width: 32,
        height: 32,
        border: 'none',
        borderRadius: sizing.radius,
        background: 'transparent',
        color: palette.sub,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
      }}
    >
      <BellOutlined />
      {text && (
        <span
          style={{
            position: 'absolute',
            top: 3,
            right: 1,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 8,
            background: palette.accent,
            color: palette.surface,
            fontFamily: fonts.mono,
            fontSize: 10,
            lineHeight: '16px',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          {text}
        </span>
      )}
    </button>
  );
}
