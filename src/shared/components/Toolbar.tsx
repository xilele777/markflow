// Toolbar —— 列表页工具栏（《组件清单.md》二、《页面模板.md》一）。
// 搜索 + 筛选 + 主操作，同一行右对齐。children 自左到右排布，整体靠右。
import type { ReactNode } from 'react';

interface ToolbarProps {
  children: ReactNode;
}

export function Toolbar({ children }: ToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      {children}
    </div>
  );
}
