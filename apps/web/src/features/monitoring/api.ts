// monitoring 接口函数（《接口层.md》§三）。汇总仅系统管理员可调。
import { post } from '@/shared/api/http';
import type { WebVitalsSummary } from './types';

/** Web Vitals 汇总 · POST /api/monitoring/getWebVitalsSummary。days 1–90，默认 7。 */
export function getWebVitalsSummary(days?: number): Promise<WebVitalsSummary> {
  return post<WebVitalsSummary>('/monitoring/getWebVitalsSummary', { days });
}
