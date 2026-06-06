// 布局类 · 行（横向）：把组件并排放。N 个单元格(cell-0..cell-N)各是一个拖放区，内部仍可纵向堆叠。
// 用它实现「一行多个图片/视频并排」。切换列数时多余列内容会被隐藏(同 root 框架)。
import type { ComponentConfig } from '@measured/puck';
import { DropZone } from '@measured/puck';
import { palette } from '@/app/theme';
import { useRuntime } from '../runtime';

export interface RowProps {
  columns: number;
  gap: number;
  align: 'top' | 'center' | 'stretch';
}

export const Row: ComponentConfig<RowProps> = {
  label: '行（横向）',
  fields: {
    columns: {
      type: 'radio',
      label: '列数',
      options: [
        { label: '2', value: 2 },
        { label: '3', value: 3 },
        { label: '4', value: 4 },
      ],
    },
    gap: { type: 'number', label: '间距 (px)', min: 0 },
    align: {
      type: 'radio',
      label: '垂直对齐',
      options: [
        { label: '顶部', value: 'top' },
        { label: '居中', value: 'center' },
        { label: '等高', value: 'stretch' },
      ],
    },
  },
  defaultProps: { columns: 2, gap: 16, align: 'top' },
  render: ({ columns, gap, align }) => {
    const { mode } = useRuntime();
    const editing = mode === 'edit';
    const n = Math.max(1, columns || 2);
    const alignItems = align === 'center' ? 'center' : align === 'stretch' ? 'stretch' : 'flex-start';
    return (
      <div style={{ display: 'flex', gap: gap ?? 16, alignItems, marginBottom: 14 }}>
        {Array.from({ length: n }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 0,
              ...(editing
                ? { border: `1px dashed ${palette.border}`, borderRadius: 6, padding: 8, background: palette.surface }
                : null),
            }}
          >
            <DropZone zone={`cell-${i}`} minEmptyHeight={80} />
          </div>
        ))}
      </div>
    );
  },
};
