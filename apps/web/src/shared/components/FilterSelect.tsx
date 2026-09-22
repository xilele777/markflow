// FilterSelect —— 筛选（《组件清单.md》二）。标签 + chevron，选中 accentSoft 底。
// 落地 AntD Dropdown + chip 触发器，外观完全可控（贴合设计原型 FilterChip）。
import { Dropdown } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { palette, fonts, sizing } from '@/app/theme';

export interface FilterOption<V = string | number> {
  label: string;
  value: V;
}

interface FilterSelectProps<V = string | number> {
  /** 字段名，如「类型」「状态」。 */
  label: string;
  value?: V;
  options: FilterOption<V>[];
  /** 选「全部」时回传 undefined。 */
  onChange?: (value: V | undefined) => void;
  /** 「全部」项文案，默认「全部」。 */
  allLabel?: string;
}

export function FilterSelect<V extends string | number = string>({
  label,
  value,
  options,
  onChange,
  allLabel = '全部',
}: FilterSelectProps<V>) {
  const current = options.find((o) => o.value === value);
  const active = current != null;
  const items = [
    { key: '__all__', label: allLabel },
    ...options.map((o) => ({ key: String(o.value), label: o.label })),
  ];

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items,
        selectable: true,
        selectedKeys: [active ? String(value) : '__all__'],
        onClick: ({ key }) => {
          if (key === '__all__') onChange?.(undefined);
          else onChange?.(options.find((o) => String(o.value) === key)!.value);
        },
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: sizing.controlHeight,
          padding: '0 12px',
          borderRadius: sizing.radius,
          cursor: 'pointer',
          userSelect: 'none',
          background: active ? palette.accentSoft : palette.surface,
          border: `1px solid ${active ? 'transparent' : palette.border}`,
          color: active ? palette.accent : palette.sub,
          fontFamily: fonts.body,
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          whiteSpace: 'nowrap',
        }}
      >
        {label}：{current?.label ?? allLabel}
        <DownOutlined style={{ fontSize: 10, color: active ? palette.accent : palette.weak }} />
      </div>
    </Dropdown>
  );
}
