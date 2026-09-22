// 标注任务列表（《页面模板.md》一）。列字段对齐 getCaseList（《接口文档.md》八）。
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusOutlined } from '@ant-design/icons';
import {
  Btn,
  DataTable,
  EmptyState,
  ErrorState,
  FilterSelect,
  Pagination,
  SearchField,
  StatusDot,
  Tag,
  TextLink,
  Toolbar,
  type ColumnDef,
  type FilterOption,
} from '@/shared/components';
import { CASE_STATUS, DATA_SOURCE_TYPE, STATUS, metaOf } from '@/shared/constants';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import { palette } from '@/app/theme';
import { useWorkspaceStore } from '@/shared/store/workspace';
import type { CaseListItem, GetCaseListRequest } from '../types';
import { getCaseList } from '../api';

const PAGE_SIZE = 10;

const STATUS_OPTIONS: FilterOption<number>[] = [
  { label: '未启动', value: 1 },
  { label: '运行中', value: 2 },
  { label: '已暂停', value: 3 },
  { label: '已结束', value: 4 },
];

const SOURCE_OPTIONS: FilterOption<number>[] = [
  { label: '数据集', value: 1 },
  { label: '流式', value: 2 },
];

export default function CaseListPage() {
  const navigate = useNavigate();
  // 标注任务是空间内的：spaceCode 进 queryKey，切换空间会重拉；未选空间则不请求、给提示。
  const spaceCode = useWorkspaceStore((s) => s.spaceCode);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<number | undefined>(undefined);
  const [source, setSource] = useState<number | undefined>(undefined);
  const [pageNum, setPageNum] = useState(1);

  const params: GetCaseListRequest = useMemo(
    () => ({ keyword, status, pageNum, pageSize: PAGE_SIZE }),
    [keyword, status, pageNum],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['case', 'list', spaceCode, params],
    queryFn: () => getCaseList(params),
    enabled: !!spaceCode,
  });

  // 数据来源是前端附加筛选（后端 getCaseList 入参未提供 source 字段，本地过滤即可）。
  const filtered = useMemo(() => {
    const list = data?.list ?? [];
    return source == null ? list : list.filter((c) => c.dataSourceType === source);
  }, [data, source]);

  const columns: ColumnDef<CaseListItem>[] = [
    { key: 'caseId', label: 'ID', width: 80, mono: true },
    { key: 'name', label: '任务名', flex: true },
    {
      key: 'dataSourceType',
      label: '数据来源',
      width: 100,
      render: (r) => {
        const m = metaOf(DATA_SOURCE_TYPE, r.dataSourceType);
        return <Tag tone={m.tone}>{m.label}</Tag>;
      },
    },
    { key: 'labelToolCode', label: '标注工具', width: 184, mono: true },
    {
      key: 'status',
      label: '状态',
      width: 110,
      render: (r) => {
        const m = metaOf(CASE_STATUS, r.status);
        return <StatusDot tone={m.tone}>{m.label}</StatusDot>;
      },
    },
    { key: 'creator', label: '创建人', width: 100 },
    {
      key: 'deadline',
      label: '截止时间',
      width: 140,
      mono: true,
      render: (r) =>
        r.deadline == null ? (
          <span style={{ color: palette.weak }}>—</span>
        ) : (
          <span
            style={{
              color: r.deadline < Date.now() && r.status === 2 ? STATUS.failed.fg : undefined,
            }}
          >
            {formatDateTime(r.deadline)}
          </span>
        ),
    },
    { key: 'createTime', label: '创建时间', width: 124, render: (r) => formatDate(r.createTime) },
    {
      key: 'op',
      label: '操作',
      width: 96,
      align: 'right',
      render: (r) => <TextLink onClick={() => navigate(`/case/${r.caseId}`)}>查看详情</TextLink>,
    },
  ];

  const newBtn = (
    <Btn kind="primary" icon={<PlusOutlined />} onClick={() => navigate('/case/new')}>
      新建任务
    </Btn>
  );

  return (
    <>
      <Toolbar>
        <SearchField
          value={keyword}
          placeholder="搜索任务名"
          onChange={setKeyword}
          onSearch={() => setPageNum(1)}
        />
        <FilterSelect<number>
          label="数据来源"
          value={source}
          options={SOURCE_OPTIONS}
          onChange={(v) => {
            setSource(v);
            setPageNum(1);
          }}
        />
        <FilterSelect<number>
          label="状态"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => {
            setStatus(v);
            setPageNum(1);
          }}
        />
        {newBtn}
      </Toolbar>

      {!spaceCode ? (
        <EmptyState description="请先在左下角选择工作空间" />
      ) : isError ? (
        <ErrorState message="标注任务加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="caseId"
          loading={isLoading}
          empty={<EmptyState description="暂无标注任务" action={newBtn} />}
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
