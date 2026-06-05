// Btn —— 按钮（《组件清单.md》四）。primary=实心蓝 / ghost=白底描边，高 34。
// 落地 AntD Button：primary→type=primary（colorPrimary=accent）；ghost→type=default。
import { Button } from 'antd';
import type { ButtonProps } from 'antd';

export interface BtnProps extends Omit<ButtonProps, 'type'> {
  kind?: 'primary' | 'ghost';
}

export function Btn({ kind = 'ghost', ...rest }: BtnProps) {
  return <Button type={kind === 'primary' ? 'primary' : 'default'} {...rest} />;
}
