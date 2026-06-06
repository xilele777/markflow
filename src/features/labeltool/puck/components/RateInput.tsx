// 输入类 · 评分：AntD Rate，写入标注结果（数字）。
import type { ComponentConfig } from '@measured/puck';
import { Rate } from 'antd';
import { palette, fonts } from '@/app/theme';
import { useRuntime } from '../runtime';

export interface RateInputProps {
  label: string;
  resultKey: string;
  count: number;
  allowHalf: boolean;
}

export const RateInput: ComponentConfig<RateInputProps> = {
  label: '评分',
  fields: {
    label: { type: 'text', label: '标题' },
    resultKey: { type: 'text', label: '结果字段 key' },
    count: { type: 'number', label: '星级数', min: 1, max: 10 },
    allowHalf: {
      type: 'radio',
      label: '允许半星',
      options: [
        { label: '否', value: false },
        { label: '是', value: true },
      ],
    },
  },
  defaultProps: { label: '评分', resultKey: '', count: 5, allowHalf: false },
  render: ({ label, resultKey, count, allowHalf }) => {
    const { result, setField, mode } = useRuntime();
    const value = resultKey ? (result[resultKey] as number | undefined) : undefined;
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: palette.weak, marginBottom: 6, fontFamily: fonts.body }}>
          {label}
          {resultKey ? ` · ${resultKey}` : ''}
        </div>
        <Rate
          count={count || 5}
          allowHalf={allowHalf}
          disabled={mode === 'review'}
          value={value}
          onChange={(v) => resultKey && setField(resultKey, v)}
        />
      </div>
    );
  },
};
