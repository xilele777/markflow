// 任务进度（管理员视角）。getTaskGroupList 跨用户 / 跨类型查任务组，可定位 AI 任务组。
// 鉴权：仅系统管理员；非管理员直接显示 EmptyState 提示，不发请求。
// 字段对齐《接口文档.md》十「任务组列表」。
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
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
import { STAGE_TYPE, TASK_GROUP_STATUS, TASK_GROUP_TYPE, metaOf } from '@/shared/constants';
import { formatDateTime } from '@/shared/utils/format';
import { palette, fonts } from '@/app/theme';
import { useAuthStore } from '@/shared/store/auth';
import { getLabelToolList } from '@/features/labeltool/api';
import type { GetTaskGroupListRequest, TaskGroupItem } from '../types';
import { getTaskGroupList } from '../api';

const PAGE_SIZE = 10;

const TYPE_OPTIONS: FilterOption<number>[] = [
  { label: '个人组', value: 1 },
  { label: 'AI 预标池', value: 2 },
  { label: '人工标注池', value: 3 },
  { label: 'AI 预审池', value: 4 },
  { label: '初检池', value: 5 },
  { label: '复检池', value: 6 },
];

const STATUS_OPTIONS: FilterOption<number>[] = [
  { label: '待执行', value: 1 },
  { label: '执行中', value: 2 },
  { label: '已完成', value: 3 },
];

export default function TaskProgressListPage() {
  const navigate = useNavigate();
  const isSystemAdmin = useAuthStore((s) => s.user?.isSystemAdmin ?? false);

  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<number | undefined>(undefined);
  const [labelToolCode, setLabelToolCode] = useState<string | undefined>(undefined);
  const [pageNum, setPageNum] = useState(1);

  const params: GetTaskGroupListRequest = useMemo(
    () => ({
      keyword: keyword.trim() || undefined,
      type,
      status,
      labelToolCode,
      pageNum,
      pageSize: PAGE_SIZE,
    }),
    [keyword, type, status, labelToolCode, pageNum],
  );

  const { data: tools } = useQuery({
    queryKey: ['labeltool', 'forSelect'],
    queryFn: () => getLabelToolList({ pageNum: 1, pageSize: 100 }).then((r) => r.list),
    enabled: isSystemAdmin,
  });
  const toolOptions: FilterOption<string>[] = useMemo(
    () => (tools ?? []).map((t) => ({ label: t.labelToolName, value: t.labelToolCode })),
    [tools],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['taskgroup', 'progress', params],
    queryFn: () => getTaskGroupList(params),
    enabled: isSystemAdmin,
  });

  if (!isSystemAdmin) {
    return (
      <EmptyState
        description="任务进度仅系统管理员可查看"
      />
    );
  }

  const columns: ColumnDef<TaskGroupItem>[] = [
    {
      key: 'name',
      label: '任务组',
      flex: true,
      render: (g) => {
        const stageMeta = metaOf(STAGE_TYPE, g.taskType);
        const typeMeta = metaOf(TASK_GROUP_TYPE, g.type);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Tag tone={typeMeta.tone}>{typeMeta.label}</Tag>
            <Tag tone={stageMeta.tone}>{stageMeta.label}</Tag>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: palette.text,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {g.name}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: palette.weak,
                  fontFamily: fonts.body,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {g.caseName}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'annotator',
      label: '执行人',
      width: 160,
      render: (g) =>
        g.annotator ? (
          <span style={{ fontFamily: fonts.mono, fontSize: 12.5, color: palette.text }}>
            {g.annotator}
          </span>
        ) : (
          <span style={{ color: palette.weak }}>—</span>
        ),
    },
    { key: 'labelTool', label: '标注工具', width: 170, mono: true },
    {
      key: 'status',
      label: '状态',
      width: 110,
      render: (g) => {
        const m = metaOf(TASK_GROUP_STATUS, g.status);
        return <StatusDot tone={m.tone}>{m.label}</StatusDot>;
      },
    },
    {
      key: 'updateTime',
      label: '更新时间',
      width: 158,
      render: (g) => formatDateTime(g.updateTime),
    },
    {
      key: 'op',
      label: '操作',
      width: 84,
      align: 'right',
      render: (g) => (
        <TextLink
          onClick={() =>
            navigate(`/groups/${g.taskGroupId}`, {
              state: { group: g, from: 'task-progress' },
            })
          }
        >
          进入
        </TextLink>
      ),
    },
  ];

  return (
    <>
      <Toolbar>
        <SearchField
          value={keyword}
          placeholder="搜索组名 / 执行人"
          onChange={setKeyword}
          onSearch={() => setPageNum(1)}
        />
        <FilterSelect<number>
          label="组类型"
          value={type}
          options={TYPE_OPTIONS}
          onChange={(v) => {
            setType(v);
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
        <FilterSelect<string>
          label="标注工具"
          value={labelToolCode}
          options={toolOptions}
          onChange={(v) => {
            setLabelToolCode(v);
            setPageNum(1);
          }}
        />
      </Toolbar>

      {isError ? (
        <ErrorState message="任务组加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={data?.list ?? []}
          rowKey="taskGroupId"
          loading={isLoading}
          empty={<EmptyState description="暂无任务组" />}
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
