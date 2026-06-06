// 操作类 · 保存标注结果（特殊）：点击固定调用后端保存接口(saveTaskResult)，不是普通按钮。
// 行为绑定在 runtime.saveResult 上；用户可把它拖到界面任意位置。每个标注页都应放一个。
import type { ComponentConfig } from '@measured/puck';
import { Button } from 'antd';
import { useRuntime } from '../runtime';

export interface SaveResultButtonProps {
  text: string;
  align: 'left' | 'center' | 'right';
  block: boolean;
}

export const SaveResultButton: ComponentConfig<SaveResultButtonProps> = {
  label: '保存结果',
  fields: {
    text: { type: 'text', label: '按钮文案' },
    align: {
      type: 'radio',
      label: '对齐',
      options: [
        { label: '左', value: 'left' },
        { label: '中', value: 'center' },
        { label: '右', value: 'right' },
      ],
    },
    block: {
      type: 'radio',
      label: '宽度',
      options: [
        { label: '自适应', value: false },
        { label: '整行', value: true },
      ],
    },
  },
  defaultProps: { text: '保存标注结果', align: 'right', block: false },
  render: ({ text, align, block }) => {
    const { mode, saveResult, saving } = useRuntime();
    const justify = align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end';
    return (
      <div style={{ marginTop: 8, marginBottom: 14, display: 'flex', justifyContent: block ? 'stretch' : justify }}>
        <Button
          type="primary"
          block={block}
          loading={saving}
          disabled={mode === 'edit' || mode === 'review'}
          onClick={() => saveResult?.()}
        >
          {text}
        </Button>
      </div>
    );
  },
};
