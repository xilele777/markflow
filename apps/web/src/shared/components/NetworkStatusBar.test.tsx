import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkStatusBar, NETWORK_OFFLINE_TEXT, NETWORK_RECOVERED_TEXT } from './NetworkStatusBar';
import { RECOVER_HOLD_MS } from '@/shared/hooks/useNetworkStatus';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('NetworkStatusBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOnline(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
  });

  it('在线时不渲染', () => {
    render(<NetworkStatusBar />);
    expect(screen.queryByTestId('network-status-bar')).toBeNull();
  });

  it('初始离线即显示断网提示', () => {
    setOnline(false);
    render(<NetworkStatusBar />);
    expect(screen.getByText(NETWORK_OFFLINE_TEXT)).toBeTruthy();
    expect(screen.getByTestId('network-status-bar').getAttribute('data-state')).toBe('offline');
  });

  it('offline 事件显示提示，online 事件后显示已恢复并在 3s 后消失', () => {
    render(<NetworkStatusBar />);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(NETWORK_OFFLINE_TEXT)).toBeTruthy();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByText(NETWORK_RECOVERED_TEXT)).toBeTruthy();
    expect(screen.getByTestId('network-status-bar').getAttribute('data-state')).toBe('recovered');

    act(() => {
      vi.advanceTimersByTime(RECOVER_HOLD_MS + 10);
    });
    expect(screen.queryByTestId('network-status-bar')).toBeNull();
  });

  it('页面重新可见时按 navigator.onLine 复查', () => {
    render(<NetworkStatusBar />);
    act(() => {
      setOnline(false);
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByText(NETWORK_OFFLINE_TEXT)).toBeTruthy();
  });
});
