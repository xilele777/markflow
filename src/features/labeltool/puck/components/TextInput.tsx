// 输入类 · 文本输入：绑定 resultKey，把用户输入写入标注结果。
import type { ComponentConfig } from '@measured/puck';
import { Input } from 'antd';
import { palette, fonts } from '@/app/theme';
import { useRuntime } from '../runtime';
import { minHeightField } from '../fields';

export interface TextInputProps {
  label: string;
  resultKey: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  showCount?: boolean;
  minHeight?: number;
}

export const TextInput: ComponentConfig<TextInputProps> = {
  label: '文本输入',
  fields: {
    label: { type: 'text', label: '标题' },
    resultKey: { type: 'text', label: '结果字段 key' },
    placeholder: { type: 'text', label: '占位提示' },
    multiline: {
      type: 'radio',
      label: '多行',
      options: [
        { label: '单行', value: false },
        { label: '多行', value: true },
      ],
    },
    rows: { type: 'number', label: '多行行数', min: 2, max: 16 },
    maxLength: { type: 'number', label: '最大字数 (0 不限)', min: 0 },
    showCount: {
      type: 'radio',
      label: '显示字数',
      options: [
        { label: '否', value: false },
        { label: '是', value: true },
      ],
    },
    minHeight: minHeightField,
  },
  defaultProps: { label: '文本输入', resultKey: '', placeholder: '请输入', multiline: false, rows: 3, maxLength: 0, showCount: false, minHeight: 0 },
  render: ({ label, resultKey, placeholder, multiline, rows, maxLength, showCount, minHeight }) => {
    const { result, setField, mode } = useRuntime();
    const value = resultKey ? ((result[resultKey] as string | undefined) ?? '') : '';
    const disabled = mode === 'review';
    const max = maxLength && maxLength > 0 ? maxLength : undefined;
    return (
      <div style={{ marginBottom: 14, minHeight: minHeight || undefined }}>
        <div style={{ fontSize: 12, color: palette.weak, marginBottom: 6, fontFamily: fonts.body }}>
          {label}
          {resultKey ? ` · ${resultKey}` : ''}
        </div>
        {multiline ? (
          <Input.TextArea
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={max}
            showCount={showCount}
            autoSize={{ minRows: rows || 3, maxRows: Math.max(rows || 3, 8) }}
            onChange={(e) => resultKey && setField(resultKey, e.target.value)}
          />
        ) : (
          <Input
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={max}
            showCount={showCount}
            onChange={(e) => resultKey && setField(resultKey, e.target.value)}
          />
        )}
      </div>
    );
  },
};
