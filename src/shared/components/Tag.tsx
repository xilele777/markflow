// Tag —— 分类 / 类型标签（《组件清单.md》二）。浅底 + 中调字、圆角 4。
// tone 取自 CATEGORY / NEUTRAL（《状态映射.md》），不用 AntD Tag 预设色、不硬编码。
import type { CSSProperties, ReactNode } from 'react';
import type { Tone } from '@/shared/constants';
import { fonts } from '@/app/theme';

interface TagProps {
  tone: Tone;
  children?: ReactNode;
  /** ID / 编号类用等宽体。 */
  mono?: boolean;
  style?: CSSProperties;
}

export function Tag({ tone, children, mono, style }: TagProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: tone.bg,
        color: tone.fg,
        fontFamily: mono ? fonts.mono : fonts.body,
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        padding: '4px 8px',
        borderRadius: 4,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children ?? tone.label}
    </span>
  );
}
