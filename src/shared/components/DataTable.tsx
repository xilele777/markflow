// DataTable —— 全站表格唯一入口（《组件清单.md》二、《页面模板.md》一）。
// 列驱动 {key,label,width/flex,align,mono,render}；行高 44、表头 fill、行间 hairline。
// 操作列=文字链接(TextLink)、不用「…」；ID/编号/版本/数字=mono；分页用独立 <Pagination/>，此处关闭内置分页。
import type { ReactNode } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { fonts } from '@/app/theme';
import { EmptyState } from './EmptyState';

export interface ColumnDef<T> {
  key: string;
  label: ReactNode;
  /** 取值字段，默认同 key。 */
  dataIndex?: keyof T;
  width?: number;
  /** 弹性列（占满剩余、可省略宽度），通常给「名称」列。 */
  flex?: boolean;
  align?: 'left' | 'right' | 'center';
  /** ID / 编号 / 版本 / 数字 用等宽体。 */
  mono?: boolean;
  /** 自定义单元格；不传则取 dataIndex 原值。 */
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: keyof T | ((row: T) => string | number);
  loading?: boolean;
  /** 自定义空态（如带主操作的 EmptyState）；不传给默认空态。 */
  empty?: ReactNode;
}

export function DataTable<T extends object>({
  columns,
  data,
  rowKey,
  loading,
  empty,
}: DataTableProps<T>) {
  const antColumns: ColumnsType<T> = columns.map((c) => ({
    key: c.key,
    title: c.label,
    dataIndex: (c.dataIndex ?? c.key) as string,
    width: c.flex ? undefined : c.width,
    align: c.align ?? 'left',
    ellipsis: c.flex ? true : undefined,
    render: (value: unknown, row: T) => {
      const content = c.render ? c.render(row) : (value as ReactNode);
      if (c.mono) {
        // ID / 编号 / 版本 / 编码 等 mono 内容不换行（宽度要给够，避免掉行）。
        return <span style={{ fontFamily: fonts.mono, whiteSpace: 'nowrap' }}>{content}</span>;
      }
      return content;
    },
  }));

  return (
    <Table<T>
      columns={antColumns}
      dataSource={data}
      rowKey={rowKey as never}
      loading={loading}
      pagination={false}
      tableLayout="fixed"
      locale={{ emptyText: empty ?? <EmptyState /> }}
    />
  );
}
