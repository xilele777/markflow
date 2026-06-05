// EmptyState —— 空态（《组件清单.md》三）。一句话说明 + 可选主操作入口（《文案规范.md》五）。
import type { ReactNode } from 'react';
import { Empty } from 'antd';

interface EmptyStateProps {
  /** 一句话说明，如「暂无任务组」。 */
  description?: string;
  /** 可选主操作（如「新建数据集」）。 */
  action?: ReactNode;
}

export function EmptyState({ description = '暂无数据', action }: EmptyStateProps) {
  return (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} style={{ padding: '40px 0' }}>
      {action}
    </Empty>
  );
}
