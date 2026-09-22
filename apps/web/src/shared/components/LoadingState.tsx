// LoadingState —— 加载态（《组件清单.md》三）。列表/详情/抽屉通用骨架。
import { Skeleton } from 'antd';

interface LoadingStateProps {
  /** 骨架行数，默认 6。 */
  rows?: number;
}

export function LoadingState({ rows = 6 }: LoadingStateProps) {
  return (
    <div style={{ padding: '12px 0' }}>
      <Skeleton active paragraph={{ rows }} title={false} />
    </div>
  );
}
