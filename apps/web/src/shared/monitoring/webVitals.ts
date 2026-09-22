// 采集页面核心性能指标（Core Web Vitals）并上报到后端 POST /api/monitoring/reportWebVitals。
// 仅生产构建注册；上报走 sendBeacon（页面卸载时仍可靠发送、不阻塞主线程），退化为 keepalive fetch。
// 后端接口公开（不带 Authorization）、独立限流、落表；系统管理员可在「前端性能」页看汇总。
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

export const WEB_VITALS_ENDPOINT = '/api/monitoring/reportWebVitals';

export interface WebVitalPayload {
  name: Metric['name'];
  /** ms 指标取整；CLS 为无量纲小数，放大 1000 倍取整便于聚合。 */
  value: number;
  rating: Metric['rating'];
  id: string;
  navigationType: Metric['navigationType'];
  /** 上报时的路径（不含 query，避免把 token / 业务参数带出去）。 */
  page: string;
  timestamp: number;
}

export function toPayload(metric: Metric, page = window.location.pathname): WebVitalPayload {
  return {
    name: metric.name,
    value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
    page,
    timestamp: Date.now(),
  };
}

function report(metric: Metric) {
  try {
    const body = JSON.stringify(toPayload(metric));
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(WEB_VITALS_ENDPOINT, body);
    } else {
      void fetch(WEB_VITALS_ENDPOINT, {
        method: 'POST',
        body,
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  } catch {
    // 监控上报自身不应产生错误。
  }
}

/** 采集 LCP / INP / CLS（核心）与 FCP / TTFB（辅助）并上报。开发环境不注册。 */
export function initWebVitals() {
  if (!import.meta.env.PROD) return;
  onLCP(report);
  onINP(report);
  onCLS(report);
  onFCP(report);
  onTTFB(report);
}
