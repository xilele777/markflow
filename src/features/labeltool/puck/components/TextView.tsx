// 展示类 · 文本展示：绑定 sampleData 的某个字段（支持嵌套路径），只读显示。字体/盒子外观可配置。
import type { ComponentConfig } from '@measured/puck';
import { palette, fonts } from '@/app/theme';
import { useRuntime, getByPath } from '../runtime';
import {
  sampleFieldField,
  minHeightField,
  fontSizeField,
  toneField,
  alignField,
  weightField,
  lineHeightField,
  maxLinesField,
  borderedField,
  borderStyleField,
  borderColorField,
  bgToneField,
  radiusField,
  paddingField,
  toneColor,
  boxStyle,
  type Tone,
  type BorderTone,
  type BgTone,
} from '../fields';

export interface TextViewProps {
  label: string;
  showLabel: boolean;
  sampleField: string;
  fontSize?: number;
  weight?: 'normal' | 'bold';
  tone?: Tone;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  maxLines?: number;
  bordered?: boolean;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  borderColor?: BorderTone;
  bg?: BgTone;
  radius?: number;
  padding?: number;
  minHeight?: number;
}

export const TextView: ComponentConfig<TextViewProps> = {
  label: '文本展示',
  fields: {
    label: { type: 'text', label: '标题' },
    showLabel: {
      type: 'radio',
      label: '显示标题',
      options: [
        { label: '显示', value: true },
        { label: '隐藏', value: false },
      ],
    },
    sampleField: sampleFieldField,
    fontSize: fontSizeField,
    weight: weightField,
    tone: toneField,
    align: alignField,
    lineHeight: lineHeightField,
    maxLines: maxLinesField,
    bordered: borderedField,
    borderStyle: borderStyleField,
    borderColor: borderColorField,
    bg: bgToneField,
    radius: radiusField,
    padding: paddingField,
    minHeight: minHeightField,
  },
  defaultProps: {
    label: '文本',
    showLabel: true,
    sampleField: '',
    fontSize: 14,
    weight: 'normal',
    tone: 'text',
    align: 'left',
    lineHeight: 1.6,
    maxLines: 0,
    bordered: false,
    borderStyle: 'solid',
    borderColor: 'hairline',
    bg: 'none',
    radius: 6,
    padding: 0,
  },
  // render 只做转发：hooks 放在真正的函数组件 TextViewRender 里（rules-of-hooks）。
  render: (props) => <TextViewRender {...props} />,
};

function TextViewRender(props: TextViewProps) {
  const { label, showLabel, sampleField, fontSize, weight, tone, align, lineHeight, maxLines, minHeight } = props;
  const { sampleData } = useRuntime();
  const value = sampleField ? getByPath(sampleData, sampleField) : undefined;
  const has = value != null && value !== '';
  const clamp =
    maxLines && maxLines > 0
      ? { display: '-webkit-box', WebkitLineClamp: maxLines, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }
      : {};
  return (
    <div style={{ marginBottom: 14, minHeight: minHeight || undefined, ...boxStyle(props) }}>
      {showLabel !== false && <div style={{ fontSize: 12, color: palette.weak, marginBottom: 4 }}>{label}</div>}
      <div
        style={{
          fontSize: fontSize || 14,
          fontWeight: weight === 'bold' ? 700 : 400,
          lineHeight: lineHeight || 1.6,
          textAlign: align || 'left',
          fontFamily: fonts.body,
          color: has ? toneColor(tone) : palette.weak,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          ...clamp,
        }}
      >
        {has ? String(value) : `（未绑定 / 无数据：${sampleField || '—'}）`}
      </div>
    </div>
  );
}
