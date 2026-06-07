// DataTable —— 全站表格唯一入口（《组件清单.md》二、《页面模板.md》一）。
// 列驱动 {key,label,width/flex,align,mono,render}；行高 44、表头 fill、行间 hairline。
// 操作列=文字链接(TextLink)、不用「…」；ID/编号/版本/数字=mono；分页用独立 <Pagination/>，此处关闭内置分页。
//
// 列宽 & 截断：tableLayout=fixed；所有列默认 ellipsis（含 mono），长内容截断 + hover 显示
// 完整文本，避免某列内容超长把相邻列挤掉（如长 labelToolCode `buyer_recommend_position_v2`）。
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

/** 试着从单元格内容里抽一个 string 用作 title（hover 全文）。
 *  原值是 string/number → 直接转字符串；render 返回的 ReactNode → 一律不推（不准）。
 */
function inferTitle(rawValue: unknown): string | undefined {
  if (rawValue == null) return undefined;
  if (typeof rawValue === 'string') return rawValue;
  if (typeof rawValue === 'number') return String(rawValue);
  return undefined;
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
    // 所有列都开 ellipsis；纯字符串内容 AntD 会自动挂 title。
    // 操作列禁掉 ellipsis（按钮 / 链接群不需要被截）。
    ellipsis: c.key === 'op' ? false : { showTitle: true },
    onCell: (row: T) => {
      // 自定义 render 的列 AntD 无法推 title；这里兜底：拿原始 dataIndex 值推一次。
      if (c.key === 'op') return {};
      const raw = (row as Record<string, unknown>)[(c.dataIndex ?? c.key) as string];
      const title = inferTitle(raw);
      return title ? { title } : {};
    },
    render: (value: unknown, row: T) => {
      const content = c.render ? c.render(row) : (value as ReactNode);
      if (c.mono) {
        // ID / 编号 / 版本 / 编码 等 mono 内容：nowrap + 截断（避免横向溢出盖列）。
        // 不写 nowrap 时 AntD 的 ellipsis 仍会按行截，但 mono 编码常单行更易读。
        return (
          <span
            style={{
              fontFamily: fonts.mono,
              display: 'inline-block',
              maxWidth: '100%',
              verticalAlign: 'bottom',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {content}
          </span>
        );
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
