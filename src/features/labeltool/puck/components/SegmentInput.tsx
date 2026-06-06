// 选择类 · 分段单选：AntD Segmented 风格的单选，写入标注结果。用于「优秀/合格/不合格」这类评级。
import type { ComponentConfig } from '@measured/puck';
import { Segmented } from 'antd';
import { palette, fonts } from '@/app/theme';
import { useRuntime } from '../runtime';

export interface SegmentInputProps {
  label: string;
  resultKey: string;
  options: { label: string }[];
}

export const SegmentInput: ComponentConfig<SegmentInputProps> = {
  label: '分段单选',
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
  },
  defaultProps: {
    label: '评级',
    resultKey: '',
    options: [{ label: '优秀' }, { label: '合格' }, { label: '不合格' }],
  },
  render: ({ label, resultKey, options }) => {
    const { result, setField, mode } = useRuntime();
    const value = resultKey ? (result[resultKey] as string | undefined) : undefined;
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: palette.weak, marginBottom: 6, fontFamily: fonts.body }}>
          {label}
          {resultKey ? ` · ${resultKey}` : ''}
        </div>
        <Segmented
          block
          value={value}
          disabled={mode === 'review'}
          onChange={(v) => resultKey && setField(resultKey, v)}
          options={options.map((o) => o.label)}
        />
      </div>
    );
  },
};
