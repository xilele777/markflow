// PagePlaceholder —— 未实现页面的统一占位（壳内）。后续按《页面模板.md》逐个替换为真实页面。
import { EmptyState } from '@/shared/components';

export function PagePlaceholder({ title }: { title: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', flex: 1, minHeight: 360 }}>
      <EmptyState description={`${title} · 页面建设中`} />
    </div>
  );
}

/** 全屏占位（执行页等脱壳路由用）。 */
export function FullscreenPlaceholder({ title }: { title: string }) {
  return (
    <div style={{ height: 'var(--app-vh)', display: 'grid', placeItems: 'center' }}>
      <EmptyState description={`${title} · 页面建设中`} />
    </div>
  );
}
