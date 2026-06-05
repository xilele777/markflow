// BrandMark —— 几何品牌标（2×2 错位方格，「枢/pivot」意象）。仅用简单 rect。
import { palette } from '@/app/theme';

export function BrandMark({ size = 22, color = palette.accent }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="8" height="8" rx="1.5" fill={color} />
      <rect x="13" y="2" width="8" height="8" rx="1.5" fill={color} opacity="0.38" />
      <rect x="2" y="13" width="8" height="8" rx="1.5" fill={color} opacity="0.38" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" fill={color} />
    </svg>
  );
}
