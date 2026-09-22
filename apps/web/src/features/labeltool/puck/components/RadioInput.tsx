// 输入类 · 单选标签：绑定 resultKey，单选写入标注结果。
import type { ComponentConfig } from '@measured/puck';
import { Radio } from 'antd';
import { palette, fonts } from '@/app/theme';
import { useRuntime } from '../runtime';
import { minHeightField } from '../fields';

export interface RadioInputProps {
  label: string;
  /** 结果字段 key（写到标注结果的哪个键）。 */
  resultKey: string;
  options: { label: string }[];
  direction?: 'horizontal' | 'vertical';
  optionType?: 'default' | 'button';
  minHeight?: number;
}

export const RadioInput: ComponentConfig<RadioInputProps> = {
  label: '单选标签',
  fields: {
    label: { type: 'text', label: '标题' },
    resultKey: { type: 'text', label: '结果字段 key' },
    options: {
      type: 'array',
      label: '选项',
      arrayFields: { label: { type: 'text', label: '选项' } },
      defaultItemProps: { label: '选项' },
      getItemSummary: (item) => item.label || '选项',
    },
    direction: {
      type: 'radio',
      label: '排列',
      options: [
        { label: '横向', value: 'horizontal' },
        { label: '纵向', value: 'vertical' },
      ],
    },
    optionType: {
      type: 'radio',
      label: '样式',
      options: [
        { label: '圆点', value: 'default' },
        { label: '按钮', value: 'button' },
      ],
    },
    minHeight: minHeightField,
  },
  defaultProps: { label: '单选', resultKey: '', options: [{ label: '是' }, { label: '否' }], direction: 'horizontal', optionType: 'default', minHeight: 0 },
  // render 只做转发：hooks 放在真正的函数组件 RadioInputRender 里（rules-of-hooks）。
  render: (props) => <RadioInputRender {...props} />,
};

function RadioInputRender({ label, resultKey, options, direction, optionType, minHeight }: RadioInputProps) {
  const { result, setField, mode } = useRuntime();
  const value = resultKey ? (result[resultKey] as string | undefined) : undefined;
  const vertical = direction === 'vertical' && optionType !== 'button';
  return (
    <div style={{ marginBottom: 14, minHeight: minHeight || undefined }}>
      <div style={{ fontSize: 12, color: palette.weak, marginBottom: 6, fontFamily: fonts.body }}>
        {label}
        {resultKey ? ` · ${resultKey}` : ''}
      </div>
      <Radio.Group
        disabled={mode === 'review'}
        value={value}
        optionType={optionType === 'button' ? 'button' : 'default'}
        onChange={(e) => resultKey && setField(resultKey, e.target.value)}
        style={vertical ? { display: 'flex', flexDirection: 'column', gap: 8 } : undefined}
      >
        {options.map((o, i) =>
          optionType === 'button' ? (
            <Radio.Button key={i} value={o.label}>
              {o.label}
            </Radio.Button>
          ) : (
            <Radio key={i} value={o.label}>
              {o.label}
            </Radio>
          ),
        )}
      </Radio.Group>
    </div>
  );
}
