// 全局网络状态：navigator.onLine + online/offline 事件 + 页面重新可见时复查。
// 收敛为 online | offline；从离线恢复后 justRecovered 保持 3s，供状态条显示「已恢复」。
import { useEffect, useRef, useState } from 'react';

export type NetworkState = 'online' | 'offline';

export interface NetworkStatus {
  state: NetworkState;
  /** 从断网恢复的瞬间为 true，RECOVER_HOLD_MS 后自动复位。 */
  justRecovered: boolean;
}

export const RECOVER_HOLD_MS = 3000;

function readOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function useNetworkStatus(): NetworkStatus {
  const [state, setState] = useState<NetworkState>(() => (readOnline() ? 'online' : 'offline'));
  const [justRecovered, setJustRecovered] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let recoverTimer: ReturnType<typeof setTimeout> | undefined;

    const goOnline = () => {
      if (stateRef.current === 'offline') {
        setJustRecovered(true);
        clearTimeout(recoverTimer);
        recoverTimer = setTimeout(() => setJustRecovered(false), RECOVER_HOLD_MS);
      }
      stateRef.current = 'online';
      setState('online');
    };
    const goOffline = () => {
      stateRef.current = 'offline';
      setState('offline');
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (readOnline()) goOnline();
      else goOffline();
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(recoverTimer);
    };
  }, []);

  return { state, justRecovered };
}
