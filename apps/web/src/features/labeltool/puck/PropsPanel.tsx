// 紧凑属性面板（取代 Puck.Fields）：读选中组件的字段配置，按「分组 + 2 列网格 + 行内开关」渲染。
// 简单控件用 AntD 自渲染（布局可控），数组(选项)用 Puck AutoField，自定义字段(绑定)调其 render，布尔=Switch。
// onChange 通过 dispatch(replace) 更新选中组件 props；无选中时编辑 root(replaceRoot)。
import { useState, type CSSProperties } from 'react';
import { usePuck, AutoField } from '@measured/puck';
import { Input, InputNumber, Select, Segmented, Switch } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { palette, fonts } from '@/app/theme';
import { puckConfig } from './config';

type GroupKey = 'bind' | 'base' | 'text' | 'box' | 'layout' | 'behavior';
const GROUP_ORDER: { key: GroupKey; title: string }[] = [
  { key: 'bind', title: '绑定' },
  { key: 'base', title: '内容' },
  { key: 'text', title: '文字' },
  { key: 'box', title: '边框 / 背景' },
  { key: 'layout', title: '尺寸 / 布局' },
  { key: 'behavior', title: '行为' },
];

const FIELD_GROUP: Record<string, GroupKey> = {
  sampleField: 'bind',
  // 内容
  label: 'base', showLabel: 'base', title: 'base', resultKey: 'base', placeholder: 'base',
  text: 'base', options: 'base', tabs: 'base', count: 'base',
  submitText: 'base', resetText: 'base', onText: 'base', offText: 'base',
  // 文字
  fontSize: 'text', weight: 'text', tone: 'text', align: 'text', lineHeight: 'text', maxLines: 'text',
  // 边框 / 背景
  bordered: 'box', borderStyle: 'box', borderColor: 'box', bg: 'box', radius: 'box', padding: 'box',
  // 尺寸 / 布局
  minHeight: 'layout', width: 'layout', height: 'layout', columns: 'layout', gap: 'layout',
  block: 'layout', size: 'layout',
  // 行为
  autoplay: 'behavior', interval: 'behavior', controls: 'behavior', muted: 'behavior', loop: 'behavior',
  showDots: 'behavior', showArrows: 'behavior', fit: 'behavior', allowHalf: 'behavior',
  multiline: 'behavior', rows: 'behavior', maxLength: 'behavior', showCount: 'behavior',
  allowClear: 'behavior', vertical: 'behavior', optionType: 'behavior', direction: 'behavior',
};

const groupOf = (name: string): GroupKey => FIELD_GROUP[name] ?? 'base';

type AnyField = {
  type: string;
  label?: string;
  options?: { label: string; value?: unknown }[];
  min?: number;
  max?: number;
  render?: (props: { value: unknown; onChange: (v: unknown) => void }) => unknown;
};

function isBooleanField(field: AnyField): boolean {
  return (
    field.type === 'radio' &&
    Array.isArray(field.options) &&
    field.options.length === 2 &&
    field.options.every((o) => typeof o.value === 'boolean')
  );
}

type Layout = 'full' | 'half' | 'switch';
function layoutOf(field: AnyField): Layout {
  if (isBooleanField(field)) return 'switch';
  if (['array', 'textarea', 'custom', 'text'].includes(field.type)) return 'full';
  return 'half';
}

const groupHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  background: 'transparent',
  border: 'none',
  borderBottom: `1px solid ${palette.hairline}`,
  cursor: 'pointer',
  fontFamily: fonts.display,
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: palette.weak,
  textTransform: 'uppercase',
  padding: '0 0 5px',
  marginBottom: 10,
};
const labelTop: CSSProperties = {
  fontSize: 11,
  color: palette.sub,
  fontFamily: fonts.body,
  marginBottom: 4,
};
const labelInline: CSSProperties = {
  fontSize: 12.5,
  color: palette.text,
  fontFamily: fonts.body,
};

/** 渲染单个控件（不含外层标签）。 */
function Control({ field, value, onChange }: { field: AnyField; value: unknown; onChange: (v: unknown) => void }) {
  const t = field.type;
  if (t === 'text') {
    return <Input size="small" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  if (t === 'number') {
    return (
      <InputNumber
        size="small"
        style={{ width: '100%' }}
        min={field.min}
        max={field.max}
        value={(value as number) ?? undefined}
        onChange={(v) => onChange(v ?? 0)}
      />
    );
  }
  if (t === 'select') {
    return (
      <Select
        size="small"
        style={{ width: '100%' }}
        value={value as string | undefined}
        onChange={(v) => onChange(v)}
        options={(field.options ?? []).map((o) => ({ label: o.label, value: o.value as string }))}
      />
    );
  }
  if (t === 'radio') {
    // 非布尔单选 → 紧凑分段控件
    return (
      <Segmented
        size="small"
        block
        value={value as string | number}
        onChange={(v) => onChange(v)}
        options={(field.options ?? []).map((o) => ({ label: o.label, value: o.value as string }))}
      />
    );
  }
  if (t === 'custom' && typeof field.render === 'function') {
    return <>{field.render({ value, onChange })}</>;
  }
  // array（选项编辑器）等交给 Puck AutoField
  const { label: _omit, ...fieldNoLabel } = field as Record<string, unknown>;
  void _omit;
  return <AutoField field={fieldNoLabel as never} value={value as never} onChange={(v) => onChange(v)} />;
}

// 默认折叠的「进阶」分组，避免参数多时把面板拉太长。
const DEFAULT_COLLAPSED: GroupKey[] = ['box', 'layout', 'behavior'];

function PanelBody({
  fields,
  props,
  defaults,
  onChange,
}: {
  fields: Record<string, AnyField>;
  props: Record<string, unknown>;
  defaults: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => new Set(DEFAULT_COLLAPSED));
  const toggle = (k: GroupKey) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const names = Object.keys(fields);
  const groups = GROUP_ORDER.map((g) => ({ ...g, items: names.filter((n) => groupOf(n) === g.key) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div>
      {groups.map((g) => {
        const isOpen = !collapsed.has(g.key);
        return (
        <div key={g.key} style={{ marginBottom: 18 }}>
          <button type="button" style={groupHeader} onClick={() => toggle(g.key)}>
            {isOpen ? <DownOutlined style={{ fontSize: 9 }} /> : <RightOutlined style={{ fontSize: 9 }} />}
            <span>{g.title}</span>
            <span style={{ marginLeft: 'auto', color: palette.weak, fontWeight: 400 }}>{g.items.length}</span>
          </button>
          {isOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 12px' }}>
            {g.items.map((name) => {
              const field = fields[name];
              const lay = layoutOf(field);
              const value = props[name] ?? defaults[name];
              if (lay === 'switch') {
                return (
                  <div
                    key={name}
                    style={{
                      gridColumn: '1 / -1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span style={labelInline}>{field.label || name}</span>
                    <Switch size="small" checked={Boolean(value)} onChange={(v) => onChange(name, v)} />
                  </div>
                );
              }
              return (
                <div key={name} style={{ gridColumn: lay === 'full' ? '1 / -1' : 'auto', minWidth: 0 }}>
                  <div style={labelTop}>{field.label || name}</div>
                  <Control field={field} value={value} onChange={(v) => onChange(name, v)} />
                </div>
              );
            })}
          </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

export function PropsPanel() {
  const { appState, dispatch, selectedItem } = usePuck();

  if (selectedItem) {
    const itemSelector = appState.ui.itemSelector;
    const conf = (puckConfig.components as Record<
      string,
      { fields?: Record<string, AnyField>; defaultProps?: Record<string, unknown> }
    >)[selectedItem.type];
    const fields = conf?.fields ?? {};
    const defaults = conf?.defaultProps ?? {};
    const props = selectedItem.props as Record<string, unknown>;
    const onChange = (name: string, value: unknown) => {
      if (!itemSelector) return;
      const next = { ...selectedItem, props: { ...props, [name]: value } };
      dispatch({
        type: 'replace',
        destinationZone: itemSelector.zone ?? 'default-zone',
        destinationIndex: itemSelector.index,
        data: next as never,
      });
    };
    return (
      <div style={{ padding: 14 }}>
        <PanelBody fields={fields} props={props} defaults={defaults} onChange={onChange} />
      </div>
    );
  }

  // 未选中组件 → 编辑页面框架(root)。
  const rootFields = (puckConfig.root?.fields ?? {}) as Record<string, AnyField>;
  const rootDefaults = (puckConfig.root?.defaultProps ?? {}) as Record<string, unknown>;
  const root = appState.data.root;
  const rootProps = (root.props ?? {}) as Record<string, unknown>;
  const onChangeRoot = (name: string, value: unknown) => {
    const props = { ...rootProps, [name]: value };
    dispatch({ type: 'replaceRoot', root: { ...root, props } as unknown as typeof root });
  };
  return (
    <div style={{ padding: 14 }}>
      <PanelBody fields={rootFields} props={rootProps} defaults={rootDefaults} onChange={onChangeRoot} />
    </div>
  );
}
