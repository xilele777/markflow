// SectionCard —— 分区卡片（《组件清单.md》一）。title / 可选 desc / 可选 step 序号。
// 落地 AntD Card，圆角 7（卡片）。
import type { ReactNode } from 'react';
import { Card } from 'antd';
import { palette, fonts, sizing } from '@/app/theme';

interface SectionCardProps {
  title: ReactNode;
  /** 标题下的说明文字。 */
  desc?: ReactNode;
  /** 步骤序号（表单分区编排时用），渲染为标题前的圆形蓝标。 */
  step?: number;
  /** 卡片右上角操作区。 */
  extra?: ReactNode;
  children: ReactNode;
}

export function SectionCard({ title, desc, step, extra, children }: SectionCardProps) {
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      {step != null && (
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: palette.accent,
            color: '#fff',
            fontFamily: fonts.mono,
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          {step}
        </span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: fonts.display, fontSize: 15, fontWeight: 600, color: palette.text }}>
          {title}
        </span>
        {desc && <span style={{ fontSize: 12.5, color: palette.sub }}>{desc}</span>}
      </div>
    </div>
  );

  return (
    <Card
      title={head}
      extra={extra}
      styles={{ header: { borderBottom: `1px solid ${palette.hairline}` } }}
      style={{ borderRadius: sizing.radius + 1 }}
    >
      {children}
    </Card>
  );
}
