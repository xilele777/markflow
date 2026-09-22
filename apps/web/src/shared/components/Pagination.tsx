// Pagination —— 分页（《组件清单.md》二、《页面模板.md》一）。
// 上一页 / 页码 / 下一页 + 「跳至 N 页」，右对齐；不显示「共 N 条」。
import { Pagination as AntPagination } from 'antd';

interface PaginationProps {
  current: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
}

export function Pagination({ current, pageSize, total, onChange }: PaginationProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <AntPagination
        current={current}
        pageSize={pageSize}
        total={total}
        onChange={onChange}
        showSizeChanger={false}
        showQuickJumper
        // 不显示「共 N 条」：不传 showTotal。
      />
    </div>
  );
}
