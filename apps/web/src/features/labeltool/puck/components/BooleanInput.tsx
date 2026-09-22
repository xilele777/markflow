// 输入类 · 布尔开关：AntD Switch，写入标注结果（true/false）。
// 跟 SegmentInput 同类问题：Switch 在 checked=undefined→Boolean→false 时视觉显示「关」，
// 但 result 里没字段、提交后该 key 缺失（undefined ≠ false 在 JSON 上有区别）。
// 挂载后若无值，自动写入 false 让视觉=数据。
import { useEffect } from 'react';
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
  // render 只做转发：hooks 放在真正的函数组件 BooleanInputRender 里（rules-of-hooks）。
  render: (props) => <BooleanInputRender {...props} />,
};

function BooleanInputRender({ label, resultKey, onText, offText }: BooleanInputProps) {
  const { result, setField, mode } = useRuntime();
  const raw = resultKey ? result[resultKey] : undefined;
  const value = Boolean(raw);

  // 视觉=数据：只在真实标注模式（mode='label'）下、result 里没该字段时自动写 false。
  // 'edit'（画布预览）/ 'review'（只读回显）都不写，避免画布改 resultKey 时写入中间脏 key、或污染历史结果。
  useEffect(() => {
    if (mode !== 'label') return;
    if (!resultKey || raw !== undefined) return;
    setField(resultKey, false);
  }, [mode, resultKey, raw, setField]);

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
}
