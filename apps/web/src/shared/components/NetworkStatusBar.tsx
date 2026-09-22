// NetworkStatusBar —— 断网 / 恢复提示条（P15）。挂在 App 顶层，固定在视口顶部覆盖所有页面。
// 离线：失败红（STATUS.failed）；恢复：就绪绿（STATUS.done）保持 3s 后消失。
// 颜色只取 shared/constants 的语义色，不自建色值。
import { DisconnectOutlined, WifiOutlined } from '@ant-design/icons';
import { STATUS } from '@/shared/constants/tones';
import { fonts } from '@/app/theme';
import { useNetworkStatus } from '@/shared/hooks/useNetworkStatus';

export const NETWORK_OFFLINE_TEXT = '网络已断开，标注内容将无法保存，请检查网络连接';
export const NETWORK_RECOVERED_TEXT = '网络已恢复';

export function NetworkStatusBar() {
  const { state, justRecovered } = useNetworkStatus();
  const offline = state === 'offline';
  if (!offline && !justRecovered) return null;

  const tone = offline ? STATUS.failed : STATUS.done;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="network-status-bar"
      data-state={offline ? 'offline' : 'recovered'}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2000,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: tone.bg,
        color: tone.fg,
        borderBottom: `1px solid ${tone.fg}33`,
        fontFamily: fonts.body,
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {offline ? <DisconnectOutlined /> : <WifiOutlined />}
      <span>{offline ? NETWORK_OFFLINE_TEXT : NETWORK_RECOVERED_TEXT}</span>
    </div>
  );
}
