// StatusDot —— 状态唯一组件（《组件清单.md》二）。6px 圆点(取 fg) + 文案。
// tone 取自 STATUS（《状态映射.md》），不硬编码。
import type { ReactNode } from 'react';
import type { Tone } from '@/shared/constants';
import { fonts } from '@/app/theme';

interface StatusDotProps {
  tone: Tone;
  children?: ReactNode;
}

export function StatusDot({ tone, children }: StatusDotProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: fonts.body,
        fontSize: 13,
        color: tone.fg,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: '50%', background: tone.fg, flex: 'none' }}
      />
      {children ?? tone.label}
    </span>
  );
}
