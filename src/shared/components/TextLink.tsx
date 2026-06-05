// TextLink —— 文字链接（accent 色）。用于表格操作列、行内操作（《组件清单.md》：操作列=文字链接，不用「…」）。
import type { ReactNode } from 'react';
import { Typography } from 'antd';

interface TextLinkProps {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

export function TextLink({ children, onClick, href, disabled }: TextLinkProps) {
  return (
    <Typography.Link href={href} disabled={disabled} onClick={onClick} style={{ fontSize: 13 }}>
      {children}
    </Typography.Link>
  );
}
