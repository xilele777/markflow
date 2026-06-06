// 页面框架（root）：单栏 / 两栏 / 三栏骨架。组件拖进各列的 DropZone。
// 列分区固定为 col1 / col2 / col3（切换布局不丢已放内容，只是隐藏多余列）。
// 编辑态显示列提示与虚线区；标注 / 质检态（label/review）只渲染纯净布局。
import { DropZone } from '@measured/puck';
import { palette, fonts } from '@/app/theme';
import { useRuntime } from '../runtime';

export type RootLayoutKind = 'single' | 'two' | 'three';

export interface RootLayoutProps {
  layout: RootLayoutKind;
  leftWidth: string;
}

function ColZone({ zone, hint }: { zone: string; hint?: string }) {
  const { mode } = useRuntime();
  const editing = mode === 'edit';
  return (
    <div
      style={{
        minWidth: 0,
        ...(editing
          ? {
              border: `1px dashed ${palette.border}`,
              borderRadius: 8,
              padding: 12,
              background: palette.surface,
            }
          : null),
      }}
    >
      {editing && hint && (
        <div
          style={{
            fontFamily: fonts.display,
            fontSize: 11.5,
            fontWeight: 600,
            color: palette.sub,
            marginBottom: 8,
            letterSpacing: 0.2,
          }}
        >
          {hint}
        </div>
      )}
      <DropZone zone={zone} minEmptyHeight={140} />
    </div>
  );
}

export function RootLayoutRender({ layout, leftWidth }: { layout?: RootLayoutKind; leftWidth?: string }) {
  const kind: RootLayoutKind = layout ?? 'single';

  if (kind === 'two') {
    return (
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: leftWidth || '50%', flex: 'none', minWidth: 0 }}>
          <ColZone zone="col1" hint="左栏 · 输入数据" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ColZone zone="col2" hint="右栏 · 标注结果" />
        </div>
      </div>
    );
  }

  if (kind === 'three') {
    return (
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ColZone zone="col1" hint="左栏" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ColZone zone="col2" hint="中栏" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ColZone zone="col3" hint="右栏" />
        </div>
      </div>
    );
  }

  // single
  return <ColZone zone="col1" />;
}
