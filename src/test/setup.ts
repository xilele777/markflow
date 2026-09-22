// vitest 全局 setup：补齐 happy-dom 缺少或行为不稳的浏览器 API，并在每个用例后清理。
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// antd 的响应式观察器需要 matchMedia；happy-dom 已提供，但保留兜底以防版本差异。
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

// rc-* 组件会调用 scrollTo / getComputedStyle；happy-dom 有实现，这里只兜底 scrollTo。
if (typeof window !== 'undefined' && typeof window.scrollTo !== 'function') {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
