// 我的任务组列表（《页面模板.md》一）。当前用户作为执行人；按 taskType 筛选。
// 字段对齐 getMyTaskGroups（《接口文档.md》十）。脚手架阶段走 mock。
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  DataTable,
  EmptyState,
  ErrorState,
  FilterSelect,
  Pagination,
  StatusDot,
  Tag,
  TextLink,
  Toolbar,
  type ColumnDef,
  type FilterOption,
} from '@/shared/components';
import { STAGE_TYPE, TASK_GROUP_STATUS, metaOf } from '@/shared/constants';
import { formatDateTime } from '@/shared/utils/format';
import { palette, fonts } from '@/app/theme';
import { useWorkspaceStore } from '@/shared/store/workspace';
import type { GetMyTaskGroupsRequest, MyTaskGroupItem } from '../types';
import { getMyTaskGroups } from '../api';

const PAGE_SIZE = 10;

// 仅人工类型可在「我的任务组」出现（AI 阶段不需要人执行）。
const TYPE_OPTIONS: FilterOption<number>[] = [
  { label: '人工标注', value: 2 },
  { label: '人工初检', value: 4 },
  { label: '人工复检', value: 5 },
];

export default function MyGroupsPage() {
  const navigate = useNavigate();
  // 按当前空间过滤（getMyTaskGroups 入参里 spaceCode 是「可选」）。
  const spaceCode = useWorkspaceStore((s) => s.spaceCode);
  const [taskType, setTaskType] = useState<number | undefined>(undefined);
  const [pageNum, setPageNum] = useState(1);

  const params: GetMyTaskGroupsRequest = useMemo(
    () => ({
      spaceCode: spaceCode ?? undefined,
      taskType,
      pageNum,
      pageSize: PAGE_SIZE,
    }),
    [spaceCode, taskType, pageNum],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['taskgroup', 'mine', params],
    queryFn: () => getMyTaskGroups(params),
  });

  const columns: ColumnDef<MyTaskGroupItem>[] = [
    {
      key: 'name',
      label: '任务组',
      flex: true,
      render: (g) => {
        const typeMeta = metaOf(STAGE_TYPE, g.taskType);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Tag tone={typeMeta.tone}>{typeMeta.label}</Tag>
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
    { key: 'labelTool', label: '标注工具', width: 184, mono: true },
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
      width: 150,
      render: (g) => formatDateTime(g.updateTime),
    },
    {
      key: 'op',
      label: '操作',
      width: 84,
      align: 'right',
      // 把行数据带进详情页（详情没有独立的 getTaskGroupDetail 接口，直传比刷新更顺）。
      render: (g) => (
        <TextLink onClick={() => navigate(`/my-groups/${g.taskGroupId}`, { state: { group: g } })}>
          进入
        </TextLink>
      ),
    },
  ];

  return (
    <>
      <Toolbar>
        <FilterSelect<number>
          label="类型"
          value={taskType}
          options={TYPE_OPTIONS}
          onChange={(v) => {
            setTaskType(v);
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
