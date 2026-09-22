// 布局类 · 区块：带标题的容器，内部是可放其它组件的拖放区。边框/背景/圆角/内边距可配置。
import type { ComponentConfig } from '@measured/puck';
import { DropZone } from '@measured/puck';
import { palette, fonts } from '@/app/theme';
import {
  borderedField,
  borderStyleField,
  borderColorField,
  bgToneField,
  radiusField,
  paddingField,
  boxStyle,
  type BorderTone,
  type BgTone,
} from '../fields';

export interface SectionProps {
  title: string;
  bordered: boolean;
  borderStyle: 'solid' | 'dashed' | 'dotted';
  borderColor: BorderTone;
  bg: BgTone;
  radius: number;
  padding: number;
}

export const Section: ComponentConfig<SectionProps> = {
  label: '区块',
  fields: {
    title: { type: 'text', label: '标题' },
    bordered: borderedField,
    borderStyle: borderStyleField,
    borderColor: borderColorField,
    bg: bgToneField,
    radius: radiusField,
    padding: paddingField,
  },
  defaultProps: {
    title: '区块',
    bordered: true,
    borderStyle: 'solid',
    borderColor: 'hairline',
    bg: 'surface',
    radius: 7,
    padding: 16,
  },
  render: ({ title, bordered, borderStyle, borderColor, bg, radius, padding }) => (
    <section
      style={{
        marginBottom: 14,
        ...boxStyle({ bordered, borderStyle, borderColor, bg, radius, padding }),
      }}
    >
      {title && (
        <div
          style={{
            fontFamily: fonts.display,
            fontWeight: 600,
            fontSize: 14,
            color: palette.text,
            marginBottom: 10,
          }}
        >
          {title}
        </div>
      )}
      <DropZone zone="content" />
    </section>
  ),
};
