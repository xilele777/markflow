// 通知中心（M5）：本人的站内通知列表。筛选「仅未读」；点击条目 → 标记已读并跳转（任务组 / case 详情）；
// 「全部已读」一键清零。顶栏铃铛角标共用 ['notification','unread'] 查询，这里的变更会让它失效重拉。
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from 'antd';
import {
  Btn,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  Tag,
  TextLink,
  Toolbar,
  toast,
  type ColumnDef,
} from '@/shared/components';
import { CATEGORY, NEUTRAL, STATUS } from '@/shared/constants';
import { formatRelativeTime } from '@/shared/utils/format';
import { palette, fonts } from '@/app/theme';
import type { NotificationItem, GetNotificationListRequest } from '../types';
import { getNotificationList, markRead } from '../api';
import { notificationTarget, notificationTypeLabel } from '../format';

const PAGE_SIZE = 20;

const TYPE_TONE: Record<string, (typeof CATEGORY)[keyof typeof CATEGORY] | typeof NEUTRAL> = {
  TASK_DISPATCHED: CATEGORY.annotate,
  TASK_REJECTED: STATUS.failed,
  CASE_DEADLINE: STATUS.partial,
  CASE_FINISHED: STATUS.done,
};

export default function NotificationListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [pageNum, setPageNum] = useState(1);

  const params: GetNotificationListRequest = useMemo(
    () => ({ onlyUnread, pageNum, pageSize: PAGE_SIZE }),
    [onlyUnread, pageNum],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notification', 'list', params],
    queryFn: () => getNotificationList(params),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notification'] });
  };

  const markOne = useMutation({
    mutationFn: (id: number) => markRead({ notificationIds: [id] }),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => markRead({}),
    onSuccess: (r) => {
      toast.success(r.updated > 0 ? `已标记 ${r.updated} 条为已读` : '没有未读通知');
      invalidate();
    },
  });

  const open = (n: NotificationItem) => {
    if (!n.read) markOne.mutate(n.notificationId);
    const target = notificationTarget(n);
    if (target) navigate(target, { state: { from: 'notification' } });
  };

  const columns: ColumnDef<NotificationItem>[] = [
    {
      key: 'type',
      label: '类型',
      width: 84,
      render: (n) => <Tag tone={TYPE_TONE[n.type] ?? NEUTRAL}>{notificationTypeLabel(n.type)}</Tag>,
    },
    {
      key: 'title',
      label: '内容',
      flex: true,
      noEllipsis: true,
      render: (n) => (
        <div
          data-testid="notification-row"
          data-read={n.read ? 'true' : 'false'}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            minWidth: 0,
            padding: '4px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {!n.read && (
              <span
                aria-label="未读"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: palette.accent,
                  flex: 'none',
                }}
              />
            )}
            <span
              style={{
                fontFamily: fonts.body,
                fontSize: 13.5,
                fontWeight: n.read ? 400 : 600,
                color: n.read ? palette.sub : palette.text,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {n.title}
            </span>
          </div>
          {n.content && (
            <span
              style={{
                fontFamily: fonts.body,
                fontSize: 12.5,
                color: palette.weak,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {n.content}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'createTime',
      label: '时间',
      width: 120,
      mono: true,
      render: (n) => formatRelativeTime(n.createTime),
    },
    {
      key: 'op',
      label: '操作',
      width: 140,
      align: 'right',
      render: (n) => (
        <span style={{ display: 'inline-flex', gap: 12 }}>
          {notificationTarget(n) && <TextLink onClick={() => open(n)}>查看</TextLink>}
          {!n.read && (
            <TextLink onClick={() => markOne.mutate(n.notificationId)}>标为已读</TextLink>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <Toolbar>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: palette.sub,
            fontFamily: fonts.body,
          }}
        >
          <Switch
            size="small"
            checked={onlyUnread}
            onChange={(v) => {
              setOnlyUnread(v);
              setPageNum(1);
            }}
          />
          仅未读
        </label>
        <Btn onClick={() => markAll.mutate()} loading={markAll.isPending}>
          全部已读
        </Btn>
      </Toolbar>

      {isError ? (
        <ErrorState message="通知加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={data?.list ?? []}
          rowKey="notificationId"
          loading={isLoading}
          empty={<EmptyState description={onlyUnread ? '没有未读通知' : '暂无通知'} />}
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
