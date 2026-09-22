// 布局类 · 标签页：N 个 tab，每个 tab 内容是一个拖放区(tab-i)，点 tab 头切换。用于「标注表单随 tab 切换」。
import { useState } from 'react';
import type { ComponentConfig } from '@measured/puck';
import { DropZone } from '@measured/puck';
import { palette, fonts } from '@/app/theme';

export interface TabsProps {
  tabs: { label: string }[];
}

export const Tabs: ComponentConfig<TabsProps> = {
  label: '标签页',
  fields: {
    tabs: {
      type: 'array',
      label: '标签',
      arrayFields: { label: { type: 'text', label: '标签名' } },
      defaultItemProps: { label: '标签' },
      getItemSummary: (item) => item.label || '标签',
    },
  },
  defaultProps: { tabs: [{ label: '标签一' }, { label: '标签二' }] },
  // render 只做转发：hooks 放在真正的函数组件 TabsRender 里（rules-of-hooks）。
  render: (props) => <TabsRender {...props} />,
};

function TabsRender({ tabs }: TabsProps) {
  const list = tabs?.length ? tabs : [{ label: '标签一' }];
  const [active, setActive] = useState(0);
  const cur = Math.min(active, list.length - 1);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${palette.hairline}`, marginBottom: 12 }}>
        {list.map((t, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '6px 12px',
              cursor: 'pointer',
              fontFamily: fonts.body,
              fontSize: 13,
              fontWeight: i === cur ? 600 : 400,
              color: i === cur ? palette.accent : palette.sub,
              borderBottom: `2px solid ${i === cur ? palette.accent : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {t.label || `标签${i + 1}`}
          </button>
        ))}
      </div>
      <DropZone zone={`tab-${cur}`} minEmptyHeight={80} />
    </div>
  );
}
