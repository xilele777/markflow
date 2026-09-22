// SearchField —— 搜索输入（《组件清单.md》二）。放大镜功能图标 + 占位。
// 受控；回车或图标点击触发 onSearch。
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { palette } from '@/app/theme';

interface SearchFieldProps {
  value?: string;
  placeholder?: string;
  width?: number;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
}

export function SearchField({
  value,
  placeholder = '搜索',
  width = 240,
  onChange,
  onSearch,
}: SearchFieldProps) {
  return (
    <Input
      allowClear
      value={value}
      placeholder={placeholder}
      style={{ width }}
      prefix={<SearchOutlined style={{ color: palette.weak }} />}
      onChange={(e) => onChange?.(e.target.value)}
      onPressEnter={(e) => onSearch?.((e.target as HTMLInputElement).value)}
    />
  );
}
