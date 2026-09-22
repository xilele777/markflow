// 选择类 · 多选：AntD Checkbox.Group，结果写成数组。用于「badcase-1/2/3」这类勾选清单。
import type { ComponentConfig } from '@measured/puck';
import { Checkbox } from 'antd';
import { palette, fonts } from '@/app/theme';
import { useRuntime } from '../runtime';

export interface CheckboxInputProps {
  label: string;
  resultKey: string;
  options: { label: string }[];
  vertical?: boolean;
}

export const CheckboxInput: ComponentConfig<CheckboxInputProps> = {
  label: '多选',
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
    vertical: {
      type: 'radio',
      label: '排列',
      options: [
        { label: '横向', value: false },
        { label: '纵向', value: true },
      ],
    },
  },
  defaultProps: {
    label: '多选',
    resultKey: '',
    options: [{ label: '选项一' }, { label: '选项二' }],
    vertical: true,
  },
  // render 只做转发：hooks 放在真正的函数组件 CheckboxInputRender 里（rules-of-hooks）。
  render: (props) => <CheckboxInputRender {...props} />,
};

function CheckboxInputRender({ label, resultKey, options, vertical }: CheckboxInputProps) {
  const { result, setField, mode } = useRuntime();
  const value = resultKey ? ((result[resultKey] as string[] | undefined) ?? []) : [];
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: palette.weak, marginBottom: 6, fontFamily: fonts.body }}>
        {label}
        {resultKey ? ` · ${resultKey}` : ''}
      </div>
      <Checkbox.Group
        value={value}
        disabled={mode === 'review'}
        onChange={(v) => resultKey && setField(resultKey, v)}
        style={vertical ? { display: 'flex', flexDirection: 'column', gap: 8 } : undefined}
        options={options.map((o) => o.label)}
      />
    </div>
  );
}
