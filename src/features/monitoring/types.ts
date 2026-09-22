// monitoring 模块类型。对齐后端 monitoring.service.ts 的 WebVitalsSummary。
export type VitalName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
export type Rating = 'good' | 'needs-improvement' | 'poor';

export interface MetricSummary {
  count: number;
  /** ms 取整；CLS 为 ×1000 取整。 */
  p75: number | null;
  ratings: Record<Rating, number>;
}

export interface WebVitalsSummary {
  days: number;
  since: number;
  total: number;
  metrics: Partial<Record<VitalName, MetricSummary>>;
  trend: Array<{ date: string } & Partial<Record<VitalName, number | null>>>;
  updatedAt: number;
}
