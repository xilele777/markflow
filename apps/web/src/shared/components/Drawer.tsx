// Drawer —— 右侧抽屉（《组件清单.md》三、《页面模板.md》五）。
// 头 title/副标题 + ✕，滚动体。用于实体详情、数据集样本预览 / 解析明细。
import type { ReactNode } from 'react';
import { Drawer as AntDrawer } from 'antd';
import { palette, fonts } from '@/app/theme';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  /** 底部操作区（可选）。 */
  footer?: ReactNode;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, subtitle, width = 520, footer, children }: DrawerProps) {
  const head = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: fonts.display, fontSize: 16, fontWeight: 600, color: palette.text }}>
        {title}
      </span>
      {subtitle && <span style={{ fontSize: 12.5, color: palette.sub }}>{subtitle}</span>}
    </div>
  );

  return (
    <AntDrawer
      open={open}
      onClose={onClose}
      title={head}
      width={width}
      footer={footer}
      destroyOnHidden
    >
      {children}
    </AntDrawer>
  );
}
