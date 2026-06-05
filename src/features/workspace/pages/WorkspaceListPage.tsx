// 工作空间列表（《页面模板.md》一）。详情用抽屉、新建用弹窗（无独立路由）。
// 脚手架阶段列表走 mock；后端就绪后把 queryFn 换成 getWorkspaceList。
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusOutlined } from '@ant-design/icons';
import {
  Btn,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  SearchField,
  TextLink,
  Toolbar,
  type ColumnDef,
} from '@/shared/components';
import { formatDate } from '@/shared/utils/format';
import type { GetWorkspaceListRequest, WorkspaceListItem } from '../types';
import { getWorkspaceList } from '../api';
import { CreateWorkspaceModal } from '../components/CreateWorkspaceModal';
import { WorkspaceDetailDrawer } from '../components/WorkspaceDetailDrawer';

const PAGE_SIZE = 10;

export default function WorkspaceListPage() {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const params: GetWorkspaceListRequest = useMemo(
    () => ({ keyword, pageNum, pageSize: PAGE_SIZE }),
    [keyword, pageNum],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['workspace', 'list', params],
    queryFn: () => getWorkspaceList(params),
  });

  const refreshList = () => queryClient.invalidateQueries({ queryKey: ['workspace', 'list'] });

  const columns: ColumnDef<WorkspaceListItem>[] = [
    { key: 'spaceCode', label: '空间编码', width: 160, mono: true },
    { key: 'name', label: '空间名', flex: true },
    { key: 'description', label: '描述', flex: true },
    { key: 'createTime', label: '创建时间', width: 124, render: (w) => formatDate(w.createTime) },
    {
      key: 'op',
      label: '操作',
      width: 96,
      align: 'right',
      render: (w) => <TextLink onClick={() => setDetailId(w.workspaceId)}>查看详情</TextLink>,
    },
  ];

  const newBtn = (
    <Btn kind="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
      新建空间
    </Btn>
  );

  return (
    <>
      <Toolbar>
        <SearchField
          value={keyword}
          placeholder="搜索空间名"
          onChange={setKeyword}
          onSearch={() => setPageNum(1)}
        />
        {newBtn}
      </Toolbar>

      {isError ? (
        <ErrorState message="工作空间加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={data?.list ?? []}
          rowKey="workspaceId"
          loading={isLoading}
          empty={<EmptyState description="暂无工作空间" action={newBtn} />}
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

      <CreateWorkspaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refreshList}
      />
      <WorkspaceDetailDrawer
        workspaceId={detailId}
        open={detailId != null}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}
