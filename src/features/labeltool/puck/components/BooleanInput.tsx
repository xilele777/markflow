// 输入类 · 布尔开关：AntD Switch，写入标注结果（true/false）。
import type { ComponentConfig } from '@measured/puck';
import { Switch } from 'antd';
import { palette, fonts } from '@/app/theme';
import { useRuntime } from '../runtime';

export interface BooleanInputProps {
  label: string;
  resultKey: string;
  onText: string;
  offText: string;
}

export const BooleanInput: ComponentConfig<BooleanInputProps> = {
  label: '布尔开关',
  fields: {
    label: { type: 'text', label: '标题' },
    resultKey: { type: 'text', label: '结果字段 key' },
    onText: { type: 'text', label: '开文案' },
    offText: { type: 'text', label: '关文案' },
  },
  defaultProps: { label: '开关', resultKey: '', onText: '是', offText: '否' },
  render: ({ label, resultKey, onText, offText }) => {
    const { result, setField, mode } = useRuntime();
    const value = resultKey ? Boolean(result[resultKey]) : false;
    return (
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: palette.weak, fontFamily: fonts.body }}>
          {label}
          {resultKey ? ` · ${resultKey}` : ''}
        </span>
        <Switch
          checked={value}
          disabled={mode === 'review'}
          checkedChildren={onText}
          unCheckedChildren={offText}
          onChange={(v) => resultKey && setField(resultKey, v)}
        />
      </div>
    );
  },
};
