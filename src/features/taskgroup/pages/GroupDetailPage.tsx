// 我的任务组详情（组内任务列表，《页面模板.md》二）。字段对齐 getTaskListInGroup（《接口文档.md》九）。
// 工作量汇总：在手 = status∈{2,3,5}（执行中/打回）；待办 = status=1（待领取）。脚手架阶段走 mock。
import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Btn,
  DataTable,
  EmptyState,
  ErrorState,
  FilterSelect,
  Pagination,
  PageBackHeader,
  StatusDot,
  Tag,
  type ColumnDef,
  type FilterOption,
} from '@/shared/components';
import { STAGE_TYPE, TASK_STATUS, metaOf } from '@/shared/constants';
import { formatDateTime } from '@/shared/utils/format';
import { palette, fonts } from '@/app/theme';
import type { GetTaskListInGroupRequest, MyTaskGroupItem, TaskGroupTaskItem } from '../types';
import { getTaskListInGroup } from '../api';

const PAGE_SIZE = 10;

const STATUS_OPTIONS: FilterOption<number>[] = [
  { label: '待分配', value: 1 },
  { label: '标注中', value: 2 },
  { label: '质检中', value: 3 },
  { label: '已完成', value: 4 },
  { label: '打回重标中', value: 5 },
];

/** taskType 是质检类（initial review / recheck）→ 操作按钮文案走「质检」。 */
function isReviewStage(taskType: number): boolean {
  return taskType === 4 || taskType === 5;
}

export default function GroupDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { gid } = useParams();
  const taskGroupId = Number(gid);

  // 接口文档里没有 getTaskGroupDetail：组基本信息（名/case 名/工具/类型）由列表页 navigate(state) 带过来。
  // 直接刷新或粘贴 URL 时 state 为空，仅展示组 id；后端补口后改为独立 useQuery 拉详情。
  const group = (location.state as { group?: MyTaskGroupItem } | null)?.group;
  const review = group ? isReviewStage(group.taskType) : false;

  const [status, setStatus] = useState<number | undefined>(undefined);
  const [pageNum, setPageNum] = useState(1);

  const params: GetTaskListInGroupRequest = useMemo(
    () => ({ taskGroupId, status, pageNum, pageSize: PAGE_SIZE }),
    [taskGroupId, status, pageNum],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['taskgroup', 'tasks', params],
    queryFn: () => getTaskListInGroup(params),
    enabled: Number.isFinite(taskGroupId),
  });

  // 工作量汇总（在当前页数据上汇总；理想形态是后端单独给「在手/待办」总数）。
  const list = data?.list ?? [];
  const mine = list.filter((t) => t.status === 2 || t.status === 3 || t.status === 5).length;
  const todo = list.filter((t) => t.status === 1).length;

  // 进执行页时把当前组「在手 + 待办」的 taskId 顺序队列、组对象、组 id 带过去：
  // - 执行页用 taskIds 做「上/下一题」；
  // - 剩 ≤2 时用 taskGroupId 自动补一页待办；
  // - group 用来顶栏显示组名、返回。
  const enter = (taskId: number) => {
    const queue = list
      .filter((t) => t.status === 1 || t.status === 2 || t.status === 3 || t.status === 5)
      .map((t) => t.taskId);
    const reordered = [taskId, ...queue.filter((id) => id !== taskId)];
    navigate(review ? `/exec/review/${taskId}` : `/exec/label/${taskId}`, {
      state: { taskIds: reordered, taskGroupId, group },
    });
  };

  const opText = (t: TaskGroupTaskItem): string => {
    if (t.status === 5) return review ? '重新质检' : '重新标注';
    if (t.status === 1) return review ? '领取质检' : '领取标注';
    return review ? '进入质检' : '进入标注';
  };

  // 列宽再均分一下（原来 bizId flex 抢得太多）：序号/状态/轮次/领取时间/操作 各占等宽。
  const columns: ColumnDef<TaskGroupTaskItem>[] = [
    {
      key: 'taskGroupSeq',
      label: '序号',
      width: 96,
      mono: true,
      render: (t) => `#${t.taskGroupSeq}`,
    },
    {
      key: 'bizId',
      label: '业务 ID',
      width: 280,
      render: (t) =>
        t.bizId ? (
          <span style={{ fontFamily: fonts.mono, fontSize: 13, color: palette.text }}>{t.bizId}</span>
        ) : (
          <span style={{ color: palette.weak }}>—</span>
        ),
    },
    {
      key: 'status',
      label: '状态',
      width: 140,
      render: (t) => {
        const m = metaOf(TASK_STATUS, t.status);
        // 显示枚举的文案（标注中/质检中/打回重标中…），不是 tone 自带的默认 label。
        return <StatusDot tone={m.tone}>{m.label}</StatusDot>;
      },
    },
    {
      key: 'round',
      label: '轮次',
      width: 110,
      render: (t) => (
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 12.5,
            color: t.round > 1 ? '#a8423a' : palette.sub,
          }}
        >
          第 {t.round} 轮
        </span>
      ),
    },
    {
      key: 'claimTime',
      label: '领取时间',
      width: 160,
      render: (t) =>
        t.claimTime ? (
          <span style={{ fontFamily: fonts.mono, fontSize: 12.5, color: palette.sub }}>
            {formatDateTime(t.claimTime)}
          </span>
        ) : (
          <span style={{ color: palette.weak }}>—</span>
        ),
    },
    {
      key: 'op',
      label: '操作',
      width: 132,
      align: 'right',
      // 已完成的任务：保留「查看详情」入口（执行页会把提交按钮禁用、用只读模式渲染）。
      render: (t) =>
        t.status === 4 ? (
          <Btn kind="ghost" size="small" onClick={() => enter(t.taskId)}>
            查看详情
          </Btn>
        ) : (
          <Btn kind="primary" size="small" onClick={() => enter(t.taskId)}>
            {opText(t)}
          </Btn>
        ),
    },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <PageBackHeader
        title={group?.name ?? `任务组 #${taskGroupId}`}
        backTo="/my-groups"
      />

      {/* 组基本信息（caseName + 标注工具 + 类型 Tag） */}
      {group && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontFamily: fonts.body,
            fontSize: 12.5,
            color: palette.sub,
            marginTop: -8,
            marginBottom: 4,
          }}
        >
          <Tag tone={metaOf(STAGE_TYPE, group.taskType).tone}>
            {metaOf(STAGE_TYPE, group.taskType).label}
          </Tag>
          <span>所属任务 · {group.caseName}</span>
          <span style={{ color: palette.weak }}>·</span>
          <span style={{ color: palette.weak, fontFamily: fonts.mono, fontSize: 12 }}>
            {group.labelTool}
          </span>
        </div>
      )}

      {/* 工具栏：状态筛选左 + 在手/待办右（原型样式：space-between） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <FilterSelect<number>
          label="状态"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => {
            setStatus(v);
            setPageNum(1);
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 13, color: palette.sub }}>
            在手{' '}
            <span style={{ fontFamily: fonts.mono, color: palette.accent, fontWeight: 600 }}>
              {mine}
            </span>
          </span>
          <span style={{ fontSize: 13, color: palette.sub }}>
            待办{' '}
            <span style={{ fontFamily: fonts.mono, color: palette.text, fontWeight: 600 }}>
              {todo}
            </span>
          </span>
        </div>
      </div>

      {isError ? (
        <ErrorState message="任务列表加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={list}
          rowKey="taskId"
          loading={isLoading}
          empty={<EmptyState description="该任务组暂无任务" />}
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
    </div>
  );
}
