// TanStack Query 单例（《接口层.md》§三）。所有接口调用走它，统一 loading / error / 缓存。
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // 切 tab / 重新挂载组件都视为 stale，直接拉新。
      // 缓存仍然保留（gcTime 默认 5min），所以 isLoading 时短，会先用上次数据兜底再静默刷新。
      staleTime: 0,
    },
  },
});
