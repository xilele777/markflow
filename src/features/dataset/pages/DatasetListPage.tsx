// 数据集列表（《页面模板.md》一：工具栏 → 表格 → 分页）。列字段对齐 getDatasetList（《接口文档.md》七）。
// 脚手架阶段用 mock 数据驱动（经 react-query）；后端就绪后把 queryFn 换成 getDatasetList(params) 即可。
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
import type { PageResult } from '@/types/api';
import type { DatasetListItem, GetDatasetListRequest } from '../types';
// 后端就绪后改用：import { getDatasetList } from '../api';
import { MOCK_DATASETS } from '../mock';

const PAGE_SIZE = 10;

// —— 脚手架 mock：本地按 keyword 过滤 + 分页，模拟 getDatasetList 的 PageResult —— //
function mockFetchDatasets(req: GetDatasetListRequest): Promise<PageResult<DatasetListItem>> {
  const kw = req.keyword?.trim();
  const filtered = MOCK_DATASETS.filter(
    (d) => !kw || d.datasetName.includes(kw) || d.datasetDesc.includes(kw) || d.creator.includes(kw),
  );
  const start = (req.pageNum - 1) * req.pageSize;
  return Promise.resolve({
    list: filtered.slice(start, start + req.pageSize),
    total: filtered.length,
    pageNum: req.pageNum,
    pageSize: req.pageSize,
  });
}

export default function DatasetListPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [pageNum, setPageNum] = useState(1);

  const params: GetDatasetListRequest = useMemo(
    () => ({ keyword, pageNum, pageSize: PAGE_SIZE }),
    [keyword, pageNum],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dataset', 'list', params],
    // 后端就绪后改为 () => getDatasetList(params)。
    queryFn: () => mockFetchDatasets(params),
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

      {isError ? (
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

      {(data?.total ?? 0) > 0 && (
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
