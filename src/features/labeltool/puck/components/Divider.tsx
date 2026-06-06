// 布局类 · 分割线：可带文字的水平分割线。
import type { ComponentConfig } from '@measured/puck';
import { Divider as AntDivider } from 'antd';

export interface DividerProps {
  text: string;
}

export const Divider: ComponentConfig<DividerProps> = {
  label: '分割线',
  fields: {
    text: { type: 'text', label: '文字（可空）' },
  },
  defaultProps: { text: '' },
  render: ({ text }) => (
    <AntDivider style={{ margin: '8px 0 18px' }} plain>
      {text || undefined}
    </AntDivider>
  ),
};
