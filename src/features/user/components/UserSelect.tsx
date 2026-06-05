// UserSelect —— 选用户（可搜索远程下拉）。基于 RemoteSelect 绑 getUserList。
// 工作空间加成员、Case 人员分配等「选人」场景复用。fetcher 可注入（默认真实 getUserList，便于 mock / 测试）。
import { RemoteSelect } from '@/shared/components';
import { getUserList } from '../api';
import type { UserListItem } from '../types';

interface UserSelectProps {
  value?: number;
  onChange?: (userId: number | undefined) => void;
  /** 数据源；默认真实 getUserList，传入可用于 mock / 测试。 */
  fetcher?: (keyword: string) => Promise<UserListItem[]>;
  /** 排除已选 / 已是成员的用户。 */
  excludeUserIds?: number[];
  placeholder?: string;
  disabled?: boolean;
}

const defaultFetcher = (keyword: string) =>
  getUserList({ keyword, pageNum: 1, pageSize: 20 }).then((r) => r.list);

export function UserSelect({
  value,
  onChange,
  fetcher = defaultFetcher,
  excludeUserIds,
  placeholder = '搜索用户名 / 姓名',
  disabled,
}: UserSelectProps) {
  const fetchOptions = async (keyword: string) => {
    const users = await fetcher(keyword);
    return users
      .filter((u) => !excludeUserIds?.includes(u.userId))
      .map((u) => ({ value: u.userId, label: `${u.displayName}（${u.username}）` }));
  };

  return (
    <RemoteSelect<number>
      value={value}
      onChange={(v) => onChange?.(v as number | undefined)}
      fetchOptions={fetchOptions}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
