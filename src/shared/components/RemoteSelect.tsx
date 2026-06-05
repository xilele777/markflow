// RemoteSelect —— 带防抖远程搜索的异步下拉（《组件清单》补充件）。
// 只接收 fetchOptions(keyword)；内部管：防抖、loading、竞态（只认最后一次请求）、已选项 label 持久化。
// 适用任何「从分页接口搜实体来选」的场景（用户、数据集、工具…）。领域绑定在各自 feature 里包一层。
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Select } from 'antd';

export interface RemoteOption<V> {
  label: ReactNode;
  value: V;
}

interface RemoteSelectProps<V> {
  value?: V | V[];
  onChange?: (value: V | V[]) => void;
  /** 远程取选项；keyword 为空时取默认/首批。 */
  fetchOptions: (keyword: string) => Promise<RemoteOption<V>[]>;
  mode?: 'multiple';
  placeholder?: string;
  debounceMs?: number;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function RemoteSelect<V extends string | number>({
  value,
  onChange,
  fetchOptions,
  mode,
  placeholder,
  debounceMs = 300,
  disabled,
  style,
}: RemoteSelectProps<V>) {
  const [options, setOptions] = useState<RemoteOption<V>[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // 记住见过的 value→label，保证已选项在选项刷新后仍显示正确文案。
  const labelMap = useRef(new Map<V, ReactNode>());

  const run = (keyword: string) => {
    const id = ++reqId.current;
    setLoading(true);
    fetchOptions(keyword)
      .then((opts) => {
        if (id !== reqId.current) return; // 竞态：丢弃过期结果
        opts.forEach((o) => labelMap.current.set(o.value, o.label));
        setOptions(opts);
        setLoading(false);
      })
      .catch(() => {
        if (id !== reqId.current) return;
        setOptions([]);
        setLoading(false);
      });
  };

  const onSearch = (keyword: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run(keyword), debounceMs);
  };

  const onOpenChange = (open: boolean) => {
    if (open && options.length === 0) run('');
  };

  // 合并已选项，避免选中后搜索刷新导致 label 丢失。
  const selected: V[] = mode === 'multiple' ? ((value as V[]) ?? []) : value != null ? [value as V] : [];
  const extra = selected
    .filter((v) => !options.some((o) => o.value === v))
    .map((v) => ({ value: v, label: labelMap.current.get(v) ?? String(v) }));

  return (
    <Select
      showSearch
      filterOption={false}
      mode={mode}
      value={value}
      onChange={(v) => onChange?.(v as V | V[])}
      options={[...extra, ...options]}
      loading={loading}
      placeholder={placeholder}
      disabled={disabled}
      allowClear
      style={{ width: '100%', ...style }}
      onSearch={onSearch}
      onOpenChange={onOpenChange}
      notFoundContent={loading ? '搜索中…' : '无匹配'}
    />
  );
}
