// 数据集列表（《页面模板.md》一：工具栏 → 表格 → 分页）。列字段对齐 getDatasetList（《接口文档.md》七）。
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
import { useWorkspaceStore } from '@/shared/store/workspace';
import type { DatasetListItem, GetDatasetListRequest } from '../types';
import { getDatasetList } from '../api';

const PAGE_SIZE = 10;

export default function DatasetListPage() {
  const navigate = useNavigate();
  // 数据集是空间内的：spaceCode 进 queryKey，切换空间会重拉；未选空间则不请求、给提示。
  const spaceCode = useWorkspaceStore((s) => s.spaceCode);
  const [keyword, setKeyword] = useState('');
  const [pageNum, setPageNum] = useState(1);

  const params: GetDatasetListRequest = useMemo(
    () => ({ keyword, pageNum, pageSize: PAGE_SIZE }),
    [keyword, pageNum],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dataset', 'list', spaceCode, params],
    queryFn: () => getDatasetList(params),
    enabled: !!spaceCode,
  });

  const columns: ColumnDef<DatasetListItem>[] = [
    { key: 'datasetId', label: 'ID', width: 80, mono: true },
    { key: 'datasetName', label: '名称', flex: true },
    { key: 'datasetDesc', label: '描述', flex: true },
    { key: 'labelToolCode', label: '标注工具', width: 184, mono: true },
    {
      key: 'latestVersionNumber',
      label: '最新版本',
      width: 100,
      mono: true,
      render: (r) => `v${r.latestVersionNumber}`,
    },
    { key: 'creator', label: '创建人', width: 100 },
    {
      key: 'createTime',
      label: '创建时间',
      width: 124,
      render: (r) => formatDate(r.createTime),
    },
    {
      key: 'op',
      label: '操作',
      width: 96,
      align: 'right',
      render: (r) => <TextLink onClick={() => navigate(`/dataset/${r.datasetId}`)}>查看详情</TextLink>,
    },
  ];

  const newBtn = (
    <Btn kind="primary" icon={<PlusOutlined />} onClick={() => navigate('/dataset/new')}>
      新建数据集
    </Btn>
  );

  return (
    <>
      <Toolbar>
        <SearchField
          value={keyword}
          placeholder="搜索名称 / 描述 / 创建人"
          onChange={setKeyword}
          onSearch={() => setPageNum(1)}
        />
        {newBtn}
      </Toolbar>

      {!spaceCode ? (
        <EmptyState description="请先在左下角选择工作空间" />
      ) : isError ? (
        <ErrorState message="数据集加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={data?.list ?? []}
          rowKey="datasetId"
          loading={isLoading}
          empty={<EmptyState description="暂无数据集" action={newBtn} />}
        />
      )}

      {!!spaceCode && (data?.total ?? 0) > 0 && (
        <Pagination
          current={pageNum}
          pageSize={PAGE_SIZE}
          total={data!.total}
          onChange={setPageNum}
        />
      )}
    </>
  );
}
