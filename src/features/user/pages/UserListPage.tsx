// 用户管理列表（《页面模板.md》一）。仅系统管理员可见（本期菜单不过滤）。
// 添加：单个弹窗 / 批量导入。修改密码入口在顶栏头像菜单（本页不再放按钮）。
// 禁用 / 启用（M5）：操作列文字链接；禁用需确认（该用户的登录态立即失效）；当前登录账号不给禁用入口。
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusOutlined } from '@ant-design/icons';
import {
  Btn,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  SearchField,
  StatusDot,
  TextLink,
  Toolbar,
  confirmModal,
  toast,
  type ColumnDef,
} from '@/shared/components';
import { USER_STATUS, metaOf } from '@/shared/constants';
import { formatDate } from '@/shared/utils/format';
import { palette } from '@/app/theme';
import { useAuthStore } from '@/shared/store/auth';
import type { GetUserListRequest, UserListItem } from '../types';
import { getUserList, updateUserStatus } from '../api';
import { AddUserModal } from '../components/AddUserModal';
import { ImportUsersModal } from '../components/ImportUsersModal';

const PAGE_SIZE = 10;

export default function UserListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const params: GetUserListRequest = useMemo(
    () => ({ keyword, pageNum, pageSize: PAGE_SIZE }),
    [keyword, pageNum],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['user', 'list', params],
    queryFn: () => getUserList(params),
  });

  const refreshList = () => queryClient.invalidateQueries({ queryKey: ['user', 'list'] });
  const myUserId = useAuthStore((s) => s.user?.userId);

  const statusMutation = useMutation({
    mutationFn: (req: { userId: number; status: 0 | 1 }) => updateUserStatus(req),
    onSuccess: (r) => {
      toast.success(r.status === 1 ? '已禁用该用户' : '已启用该用户');
      refreshList();
    },
  });
  const toggleStatus = (u: UserListItem) => {
    if (u.status === 1) {
      statusMutation.mutate({ userId: u.userId, status: 0 });
      return;
    }
    confirmModal({
      title: `禁用用户 ${u.username}？`,
      content: '禁用后该账号立即无法登录，已登录的会话也会失效；可随时重新启用。',
      okText: '禁用',
      onOk: () => statusMutation.mutateAsync({ userId: u.userId, status: 1 }).then(() => undefined),
    });
  };

  const columns: ColumnDef<UserListItem>[] = [
    {
      key: 'username',
      label: '用户名',
      width: 180,
      mono: true,
      // 点击 username 进入「成员贡献」代查页（SA 视角）。
      render: (u) => (
        <TextLink
          onClick={() => navigate(`/contribution?username=${encodeURIComponent(u.username)}`)}
        >
          {u.username}
        </TextLink>
      ),
    },
    { key: 'displayName', label: '显示名', flex: true },
    {
      key: 'isSystemAdmin',
      label: '系统管理员',
      width: 110,
      render: (u) => (u.isSystemAdmin ? '是' : <span style={{ color: palette.weak }}>否</span>),
    },
    {
      key: 'status',
      label: '状态',
      width: 96,
      render: (u) => {
        const s = metaOf(USER_STATUS, u.status);
        return <StatusDot tone={s.tone}>{s.label}</StatusDot>;
      },
    },
    { key: 'createTime', label: '创建时间', width: 124, render: (u) => formatDate(u.createTime) },
    {
      key: 'op',
      label: '操作',
      width: 96,
      align: 'right',
      render: (u) =>
        u.userId === myUserId ? (
          <span style={{ color: palette.weak }}>—</span>
        ) : (
          <TextLink onClick={() => toggleStatus(u)}>{u.status === 1 ? '启用' : '禁用'}</TextLink>
        ),
    },
  ];

  const addBtn = (
    <Btn kind="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
      添加用户
    </Btn>
  );

  return (
    <>
      <Toolbar>
        <SearchField
          value={keyword}
          placeholder="搜索用户名 / 显示名"
          onChange={setKeyword}
          onSearch={() => setPageNum(1)}
        />
        <Btn onClick={() => setImportOpen(true)}>批量导入</Btn>
        {addBtn}
      </Toolbar>

      {isError ? (
        <ErrorState message="用户加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={data?.list ?? []}
          rowKey="userId"
          loading={isLoading}
          empty={<EmptyState description="暂无用户" action={addBtn} />}
        />
      )}

      {(data?.total ?? 0) > 0 && (
        <Pagination
          current={pageNum}
          pageSize={PAGE_SIZE}
          total={data!.total}
          onChange={setPageNum}
        />
      )}

      <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={refreshList} />
      <ImportUsersModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={refreshList}
      />
    </>
  );
}
