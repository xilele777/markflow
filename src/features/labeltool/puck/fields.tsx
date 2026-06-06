// 可复用的 Puck 自定义字段 / 通用字段。
// 1) 「绑定样本字段」= 数据源字段下拉（展示 / 媒体组件复用，支持嵌套路径）。
// 2) 外观字段：最小高度 / 宽高（出现在右侧「属性」抽屉里，对应点击组件后可调参数）。
import { Select, Tag } from 'antd';
import type { CustomField, NumberField, TextField } from '@measured/puck';
import { useDataSourceFields, type FieldType } from './datasource';
import { palette, fonts } from '@/app/theme';

const TYPE_LABEL: Record<FieldType, string> = {
  string: '文本',
  number: '数字',
  boolean: '布尔',
  array: '数组',
  null: '空',
};

function SampleFieldSelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
  const fields = useDataSourceFields();
  return (
    <Select
      value={value || undefined}
      onChange={(v) => onChange(v ?? '')}
      placeholder={fields.length ? '选择数据源字段' : '请先在「数据源」填写示例'}
      allowClear
      showSearch
      size="small"
      style={{ width: '100%' }}
      optionFilterProp="value"
      options={fields.map((f) => ({ value: f.path, label: f.path, type: f.type, sample: f.sample }))}
      optionRender={(opt) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: fonts.mono, fontSize: 12.5 }}>{opt.data.value}</span>
          <Tag
            bordered={false}
            style={{ margin: 0, fontSize: 11, color: palette.sub, background: palette.fill, lineHeight: '18px' }}
          >
            {TYPE_LABEL[opt.data.type as FieldType]}
          </Tag>
        </div>
      )}
    />
  );
}

/** 「绑定样本字段」字段：从当前数据源字段下拉选（支持嵌套，如 media.videoUrl）。 */
export const sampleFieldField: CustomField<string> = {
  type: 'custom',
  label: '绑定样本字段',
  render: ({ value, onChange }) => (
    <SampleFieldSelect value={value} onChange={(v) => onChange(v)} />
  ),
};

/** 外观 · 最小高度（px）。展示 / 输入组件可调，0 表示自适应。 */
export const minHeightField: NumberField = { type: 'number', label: '最小高度 (px)', min: 0 };

/** 外观 · 宽度（CSS，如 100%、320px）。媒体组件用。 */
export const widthField: TextField = { type: 'text', label: '宽度 (如 100%、320px)' };

/** 外观 · 高度（px）。媒体组件用，0 表示自适应。 */
export const heightField: NumberField = { type: 'number', label: '高度 (px)', min: 0 };

/** 外观 · 字号（px）。文字类组件用，0 表示用默认。 */
export const fontSizeField: NumberField = { type: 'number', label: '字号 (px)', min: 10, max: 48 };

/** 颜色 token（禁止硬编码色值，只用主题 token）。 */
export type Tone = 'text' | 'sub' | 'weak' | 'accent';
export function toneColor(tone: Tone | undefined): string {
  switch (tone) {
    case 'sub':
      return palette.sub;
    case 'weak':
      return palette.weak;
    case 'accent':
      return palette.accent;
    default:
      return palette.text;
  }
}

/** 外观 · 文字颜色（token 选择）。 */
export const toneField = {
  type: 'select' as const,
  label: '文字颜色',
  options: [
    { label: '默认', value: 'text' },
    { label: '次要', value: 'sub' },
    { label: '弱', value: 'weak' },
    { label: '强调', value: 'accent' },
  ],
};

/** 外观 · 对齐。 */
export const alignField = {
  type: 'radio' as const,
  label: '对齐',
  options: [
    { label: '左', value: 'left' },
    { label: '中', value: 'center' },
    { label: '右', value: 'right' },
  ],
};

/** 字重。 */
export const weightField = {
  type: 'radio' as const,
  label: '字重',
  options: [
    { label: '常规', value: 'normal' },
    { label: '加粗', value: 'bold' },
  ],
};

/** 行高（倍数）。 */
export const lineHeightField: NumberField = { type: 'number', label: '行高 (倍)', min: 1, max: 3 };

/** 最多显示行数（0 = 不限制，超出省略号）。 */
export const maxLinesField: NumberField = { type: 'number', label: '最多行数 (0 不限)', min: 0 };

// ---- 边框 / 盒子外观（容器、文本卡片等复用）----

export const borderedField = {
  type: 'radio' as const,
  label: '边框',
  options: [
    { label: '显示', value: true },
    { label: '隐藏', value: false },
  ],
};

export const borderStyleField = {
  type: 'select' as const,
  label: '边框线型',
  options: [
    { label: '实线', value: 'solid' },
    { label: '虚线', value: 'dashed' },
    { label: '点线', value: 'dotted' },
  ],
};

export type BorderTone = 'hairline' | 'border' | 'weak' | 'accent';
export const borderColorField = {
  type: 'select' as const,
  label: '边框颜色',
  options: [
    { label: '浅', value: 'hairline' },
    { label: '中', value: 'border' },
    { label: '弱', value: 'weak' },
    { label: '强调', value: 'accent' },
  ],
};
export function borderColor(tone: BorderTone | undefined): string {
  switch (tone) {
    case 'border':
      return palette.border;
    case 'weak':
      return palette.weak;
    case 'accent':
      return palette.accent;
    default:
      return palette.hairline;
  }
}

export type BgTone = 'none' | 'surface' | 'fill';
export const bgToneField = {
  type: 'select' as const,
  label: '背景',
  options: [
    { label: '无', value: 'none' },
    { label: '白', value: 'surface' },
    { label: '浅灰', value: 'fill' },
  ],
};
export function bgColor(tone: BgTone | undefined): string | undefined {
  switch (tone) {
    case 'surface':
      return palette.surface;
    case 'fill':
      return palette.fill;
    default:
      return undefined;
  }
}

export const radiusField: NumberField = { type: 'number', label: '圆角 (px)', min: 0 };
export const paddingField: NumberField = { type: 'number', label: '内边距 (px)', min: 0 };

export interface BoxProps {
  bordered?: boolean;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  borderColor?: BorderTone;
  radius?: number;
  bg?: BgTone;
  padding?: number;
}

/** 由盒子参数算出 CSS。bordered=false 时不画边框。 */
export function boxStyle(p: BoxProps): import('react').CSSProperties {
  return {
    border: p.bordered ? `1px ${p.borderStyle || 'solid'} ${borderColor(p.borderColor)}` : undefined,
    borderRadius: p.radius ?? (p.bordered ? 7 : undefined),
    background: bgColor(p.bg),
    padding: p.padding,
  };
}
