// 布局类 · 间距：纯占位空白，用来撑开纵向间距。
import type { ComponentConfig } from '@measured/puck';
import { palette } from '@/app/theme';
import { useRuntime } from '../runtime';

export interface SpacerProps {
  size: number;
}

export const Spacer: ComponentConfig<SpacerProps> = {
  label: '间距',
  fields: {
    size: { type: 'number', label: '高度 (px)', min: 0 },
  },
  defaultProps: { size: 16 },
  // render 只做转发：hooks 放在真正的函数组件 SpacerRender 里（rules-of-hooks）。
  render: (props) => <SpacerRender {...props} />,
};

function SpacerRender({ size }: SpacerProps) {
  const { mode } = useRuntime();
  return (
    <div
      style={{
        height: size || 0,
        ...(mode === 'edit' ? { outline: `1px dashed ${palette.border}`, borderRadius: 4 } : null),
      }}
    />
  );
}
