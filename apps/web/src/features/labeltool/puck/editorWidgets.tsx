// 编辑端小部件（必须在 <Puck> 内使用，依赖 usePuck）。
// - LayoutSelector：顶部「布局框架」分段器，切换单/两/三栏（写 root.props.layout）。
// - PropsPanelTitle：右侧属性抽屉标题，随选中组件变化，呼应「点击组件→右侧出现该组件参数」。
import type { ReactNode } from 'react';
import { Segmented } from 'antd';
import { usePuck } from '@measured/puck';
import { palette, fonts } from '@/app/theme';
import { puckConfig } from './config';
import type { RootLayoutKind } from './components/RootLayout';

/**
 * 右侧属性栏字段标签 override：标签做成小号、半字重、弱色（与输入控件拉开层次），字段间留白更大。
 * 传给 <Puck overrides={{ fieldLabel }} />。
 */
export function fieldLabelOverride({
  children,
  icon,
  label,
}: {
  children?: ReactNode;
  icon?: ReactNode;
  label?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label != null && label !== '' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {icon && <span style={{ display: 'inline-flex', color: palette.weak, fontSize: 13, lineHeight: 1 }}>{icon}</span>}
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.3,
              color: palette.sub,
              fontFamily: fonts.body,
            }}
          >
            {label}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

export function LayoutSelector() {
  const { appState, dispatch } = usePuck();
  const root = appState.data.root;
  const layout = ((root.props?.layout as RootLayoutKind) ?? 'single');
  const set = (v: RootLayoutKind) => {
    const props = { ...(root.props ?? {}), layout: v };
    dispatch({ type: 'replaceRoot', root: { ...root, props } as unknown as typeof root });
  };
  return (
    <div style={{ padding: '12px 12px 4px' }}>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.6,
          color: palette.weak,
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        布局框架
      </div>
      <Segmented
        block
        size="small"
        value={layout}
        onChange={(v) => set(v as RootLayoutKind)}
        options={[
          { label: '单栏', value: 'single' },
          { label: '两栏', value: 'two' },
          { label: '三栏', value: 'three' },
        ]}
      />
    </div>
  );
}

export function PropsPanelTitle() {
  const { selectedItem } = usePuck();
  const c = puckConfig.components as Record<string, { label?: string } | undefined>;
  const label = selectedItem ? c[selectedItem.type]?.label ?? selectedItem.type : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: palette.text, fontFamily: fonts.display }}>
        {label ? `属性 · ${label}` : '页面框架属性'}
      </span>
      <span style={{ fontSize: 11, color: palette.weak, fontFamily: fonts.body }}>
        {label ? '调整该组件参数（含高度 / 宽度 / 绑定）' : '点击画布中的组件，在此调整其参数'}
      </span>
    </div>
  );
}
