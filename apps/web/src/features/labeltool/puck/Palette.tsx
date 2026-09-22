// 自定义组件面板（draw.io 风）：按内容类型分区；每个组件是一枚「图标在上、名称在下」的方块，
// 一行最多 4 个，整组落在灰色「凹陷」底上。每个方块=一个单独的 <Drawer><Drawer.Item> 拖拽源，
// 外层用自己的 CSS grid 排版（绕开 Drawer 内部布局）。
import type { CSSProperties } from 'react';
import { Drawer } from '@measured/puck';
import { palette, fonts } from '@/app/theme';
import { puckConfig, componentMeta } from './config';

const catHeader: CSSProperties = {
  fontFamily: fonts.display,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  color: palette.weak,
  textTransform: 'uppercase',
  padding: '14px 12px 6px',
};

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 6,
  margin: '0 10px',
  padding: 8,
  borderRadius: 8,
  background: palette.fill,
  boxShadow: `inset 0 1px 2px rgba(15, 23, 42, 0.05)`,
};

const tile: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  padding: '9px 2px',
  borderRadius: 7,
  background: palette.surface,
  border: `1px solid ${palette.hairline}`,
  cursor: 'grab',
  minHeight: 56,
};

const tileIcon: CSSProperties = {
  fontSize: 17,
  color: palette.accent,
  lineHeight: 1,
};

const tileLabel: CSSProperties = {
  fontSize: 10.5,
  color: palette.sub,
  fontFamily: fonts.body,
  textAlign: 'center',
  lineHeight: 1.15,
  whiteSpace: 'nowrap',
};

function labelOf(name: string): string {
  const c = puckConfig.components as Record<string, { label?: string } | undefined>;
  return c[name]?.label ?? name;
}

export function Palette() {
  const categories = puckConfig.categories ?? {};
  return (
    <div style={{ paddingBottom: 10 }}>
      {Object.entries(categories).map(([key, cat]) => {
        const names = cat.components ?? [];
        if (!names.length) return null;
        return (
          <div key={key}>
            <div style={catHeader}>{cat.title ?? key}</div>
            <div style={grid}>
              {names.map((name) => (
                <Drawer key={name}>
                  <Drawer.Item name={name} label={labelOf(name)}>
                    {() => (
                      <div style={tile} title={labelOf(name)}>
                        <span style={tileIcon}>{componentMeta[name]?.icon ?? null}</span>
                        <span style={tileLabel}>{labelOf(name)}</span>
                      </div>
                    )}
                  </Drawer.Item>
                </Drawer>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
