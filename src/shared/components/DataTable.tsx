// DataTable —— 全站表格唯一入口（《组件清单.md》二、《页面模板.md》一）。
// 列驱动 {key,label,width/flex,align,mono,render}；行高 44、表头 fill、行间 hairline。
// 操作列=文字链接(TextLink)、不用「…」；ID/编号/版本/数字=mono；分页用独立 <Pagination/>，此处关闭内置分页。
//
// 列宽 & 截断：tableLayout=fixed；所有列默认 ellipsis（含 mono），长内容截断 + hover 显示
// 完整文本（自检测 td 是否溢出 → 仅溢出时浮动提示，零延迟；不溢出无提示）。
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { palette, fonts } from '@/app/theme';
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

interface HoverTip {
  text: string;
  /** 锚点（td 屏幕坐标），渲染时定位到它下方。 */
  left: number;
  top: number;
}

export function DataTable<T extends object>({
  columns,
  data,
  rowKey,
  loading,
  empty,
}: DataTableProps<T>) {
  // 自定义浮动提示：仅在 td 实际溢出时显示（不溢出无 hover），零延迟。
  // 比原生 title 快得多、也避免给每个 cell 都挂 title 导致的"无意义 hover"。
  const [tip, setTip] = useState<HoverTip | null>(null);

  const antColumns: ColumnsType<T> = columns.map((c) => ({
    key: c.key,
    title: c.label,
    dataIndex: (c.dataIndex ?? c.key) as string,
    width: c.flex ? undefined : c.width,
    align: c.align ?? 'left',
    // ellipsis 给 td 套 CSS（overflow:hidden + nowrap + text-overflow:ellipsis）；
    // showTitle:false 关掉原生 title（500ms 延迟太慢），改走我们的浮动提示。
    ellipsis: c.key === 'op' ? false : { showTitle: false },
    onCell: c.key === 'op'
      ? undefined
      : () => ({
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
            const td = e.currentTarget;
            // 判断是否真的截断：td 自身溢出，或者它的直接子元素溢出（mono span 自带 overflow:hidden
            // 会吞掉 td 的 scrollWidth，需要单独看子元素）。
            const overflow =
              td.scrollWidth > td.clientWidth + 1 ||
              Array.from(td.children).some(
                (ch) => (ch as HTMLElement).scrollWidth > (ch as HTMLElement).clientWidth + 1,
              );
            if (!overflow) return;
            const text = td.innerText?.trim();
            if (!text) return;
            const r = td.getBoundingClientRect();
            setTip({ text, left: r.left + 8, top: r.bottom + 4 });
          },
          onMouseLeave: () => setTip(null),
        }),
    render: (value: unknown, row: T) => {
      const content = c.render ? c.render(row) : (value as ReactNode);
      if (c.mono) {
        // ID / 编号 / 版本 / 编码 等 mono 内容：nowrap + 截断（避免横向溢出盖列）。
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
    <>
      <Table<T>
        columns={antColumns}
        dataSource={data}
        rowKey={rowKey as never}
        loading={loading}
        pagination={false}
        tableLayout="fixed"
        locale={{ emptyText: empty ?? <EmptyState /> }}
      />
      {tip && <OverflowTip {...tip} />}
    </>
  );
}

const tipStyle = (left: number, top: number): CSSProperties => ({
  position: 'fixed',
  left,
  top,
  zIndex: 1500,
  maxWidth: 480,
  padding: '6px 10px',
  borderRadius: 6,
  background: palette.text,
  color: '#fff',
  fontFamily: fonts.body,
  fontSize: 12.5,
  lineHeight: 1.5,
  boxShadow: '0 4px 14px rgba(0,0,0,.16)',
  pointerEvents: 'none',
  wordBreak: 'break-all',
  whiteSpace: 'normal',
});

function OverflowTip({ text, left, top }: HoverTip) {
  return <div style={tipStyle(left, top)}>{text}</div>;
}
