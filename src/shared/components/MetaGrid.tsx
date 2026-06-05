// MetaGrid / MetaItem —— 详情「基本信息」键值网格（《组件清单.md》二）。
// label 上 / value 下，value 可 mono。响应式自动换列。
import type { ReactNode } from 'react';
import { palette, fonts } from '@/app/theme';

export interface MetaField {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
}

interface MetaGridProps {
  items: MetaField[];
  /** 每行列数，默认 4。 */
  columns?: number;
}

export function MetaItem({ label, value, mono }: MetaField) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: palette.weak }}>{label}</span>
      <span
        style={{
          fontSize: 13.5,
          color: palette.text,
          fontFamily: mono ? fonts.mono : fonts.body,
          wordBreak: 'break-word',
        }}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

export function MetaGrid({ items, columns = 4 }: MetaGridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: '18px 24px',
      }}
    >
      {items.map((it, i) => (
        <MetaItem key={i} {...it} />
      ))}
    </div>
  );
}
