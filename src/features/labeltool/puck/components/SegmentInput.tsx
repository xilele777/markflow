// 选择类 · 分段单选：AntD Segmented 风格的单选，写入标注结果。用于「优秀/合格/不合格」这类评级。
// 注意 AntD Segmented 受控特性：value=undefined 时视觉上**默认高亮第一项**（但 result 里没值，
// 用户不点的话提交时该字段缺失）。所以挂载后若无值，自动把第一项写进 result，让视觉=数据。
import { useEffect } from 'react';
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
    const firstOpt = options[0]?.label;

    // 视觉=数据：只在真实标注模式（mode='label'）下、result 里没值时自动把第一项写入。
    // - 'edit'（Puck 画布预览）：搭建者在右侧改 resultKey 时每次按键都触发本 effect，
    //   会把「优秀」写到所有中间 key（'s'/'so'/'sta'/.../'status'）造成脏数据。画布只是预览，不写。
    // - 'review'（只读回显）：不写，避免污染历史结果。
    useEffect(() => {
      if (mode !== 'label') return;
      if (!resultKey || value !== undefined || firstOpt == null) return;
      setField(resultKey, firstOpt);
    }, [mode, resultKey, value, firstOpt, setField]);

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
