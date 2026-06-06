// 输入类 · 下拉单选：AntD Select，写入标注结果。
import type { ComponentConfig } from '@measured/puck';
import { Select } from 'antd';
import { palette, fonts } from '@/app/theme';
import { useRuntime } from '../runtime';

export interface SelectInputProps {
  label: string;
  resultKey: string;
  placeholder?: string;
  options: { label: string }[];
  size: 'small' | 'middle' | 'large';
  allowClear: boolean;
}

export const SelectInput: ComponentConfig<SelectInputProps> = {
  label: '下拉单选',
  fields: {
    label: { type: 'text', label: '标题' },
    resultKey: { type: 'text', label: '结果字段 key' },
    placeholder: { type: 'text', label: '占位提示' },
    options: {
      type: 'array',
      label: '选项',
      arrayFields: { label: { type: 'text', label: '选项' } },
      defaultItemProps: { label: '选项' },
      getItemSummary: (item) => item.label || '选项',
    },
    size: {
      type: 'select',
      label: '尺寸',
      options: [
        { label: '小', value: 'small' },
        { label: '中', value: 'middle' },
        { label: '大', value: 'large' },
      ],
    },
    allowClear: {
      type: 'radio',
      label: '可清除',
      options: [
        { label: '否', value: false },
        { label: '是', value: true },
      ],
    },
  },
  defaultProps: { label: '下拉', resultKey: '', placeholder: '请选择', options: [{ label: '选项一' }, { label: '选项二' }], size: 'middle', allowClear: true },
  render: ({ label, resultKey, placeholder, options, size, allowClear }) => {
    const { result, setField, mode } = useRuntime();
    const value = resultKey ? (result[resultKey] as string | undefined) : undefined;
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: palette.weak, marginBottom: 6, fontFamily: fonts.body }}>
          {label}
          {resultKey ? ` · ${resultKey}` : ''}
        </div>
        <Select
          value={value}
          placeholder={placeholder}
          disabled={mode === 'review'}
          size={size || 'middle'}
          allowClear={allowClear}
          style={{ width: '100%' }}
          onChange={(v) => resultKey && setField(resultKey, v ?? undefined)}
          options={options.map((o) => ({ label: o.label, value: o.label }))}
        />
      </div>
    );
  },
};
