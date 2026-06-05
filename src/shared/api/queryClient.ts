// TanStack Query 单例（《接口层.md》§三）。所有接口调用走它，统一 loading / error / 缓存。
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});
