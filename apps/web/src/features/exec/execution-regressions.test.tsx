import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { App } from 'antd';
import GroupDetailPage from '@/features/taskgroup/pages/GroupDetailPage';
import NotificationListPage from '@/features/notification/pages/NotificationListPage';
import LabelExecPage from './pages/LabelExecPage';
import ReviewExecPage from './pages/ReviewExecPage';
import { getTaskListInGroup } from '@/features/taskgroup/api';
import {
  getTaskDetail,
  getTaskResult,
  submitLabelTask,
  submitReviewTask,
} from '@/features/task/api';
import { getNotificationList, markRead } from '@/features/notification/api';
import type { TaskGroupTaskItem } from '@/features/taskgroup/types';

vi.mock('@/features/taskgroup/api', () => ({ getTaskListInGroup: vi.fn() }));
vi.mock('@/features/task/api', () => ({
  getTaskDetail: vi.fn(),
  getTaskResult: vi.fn(),
  submitLabelTask: vi.fn(),
  submitReviewTask: vi.fn(),
}));
vi.mock('@/features/notification/api', () => ({ getNotificationList: vi.fn(), markRead: vi.fn() }));

const pageOf = (list: TaskGroupTaskItem[]) => ({
  list,
  total: list.length,
  pageNum: 1,
  pageSize: 20,
});
const row = (taskId: number, taskType = 4, status = 3): TaskGroupTaskItem => ({
  taskId,
  taskType,
  status,
  taskGroupSeq: taskId,
  bizId: `sample-${taskId}`,
  round: 1,
  claimTime: 1,
  createTime: 1,
  updateTime: 1,
});

function mount(pathname: string, state?: unknown) {
  const router = createMemoryRouter(
    [
      { path: '/notifications', element: <NotificationListPage /> },
      { path: '/my-groups/:gid', element: <GroupDetailPage /> },
      { path: '/groups/:gid', element: <GroupDetailPage /> },
      { path: '/exec/label/:taskId', element: <LabelExecPage /> },
      { path: '/exec/review/:taskId', element: <ReviewExecPage /> },
    ],
    { initialEntries: [{ pathname, state }] },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <App>
        <RouterProvider router={router} />
      </App>
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTaskResult).mockImplementation(async (taskId, sampleType) => ({
    taskId,
    sampleType,
    hasResult: true,
    result: { label: 'ok' },
  }));
  vi.mocked(getTaskDetail).mockImplementation(async (taskId) => ({
    taskId,
    taskGroupId: 12,
    caseId: 1,
    taskType: 4,
    stageType: 'review',
    status: 3,
    round: 1,
    bizId: `sample-${taskId}`,
    annotator: 'alice',
    claimTime: 1,
    labelTool: {
      labelToolCode: 'tool',
      labelToolName: 'Tool',
      labelToolType: 2,
      labelToolUrl: '',
      labelToolPageSchema: null,
    },
  }));
});

describe('B7 任务类型由服务端决定', () => {
  it.each([3, 4, 5])('直接打开 taskType=%i 任务组，进入质检页', async (taskType) => {
    vi.mocked(getTaskListInGroup).mockResolvedValue(pageOf([row(1, taskType)]));
    const router = mount('/my-groups/12');
    fireEvent.click(await screen.findByRole('button', { name: '进入质检' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/exec/review/1'));
  });

  it('通知查看 → 任务组 → 质检执行页，无 group 导航 state', async () => {
    vi.mocked(getNotificationList).mockResolvedValue({
      list: [
        {
          notificationId: 7,
          type: 'TASK_DISPATCHED',
          title: '初检派发',
          content: null,
          refType: 'TASK_GROUP',
          refId: 12,
          read: true,
          createTime: 1,
        },
      ],
      total: 1,
      pageNum: 1,
      pageSize: 20,
    });
    vi.mocked(markRead).mockResolvedValue({ updated: 1 });
    vi.mocked(getTaskListInGroup).mockResolvedValue(pageOf([row(1)]));
    const router = mount('/notifications');
    fireEvent.click(await screen.findByText('查看'));
    fireEvent.click(await screen.findByRole('button', { name: '进入质检' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/exec/review/1'));
  });

  it('旧导航 state 的标注类型不能覆盖服务端重标审核类型', async () => {
    vi.mocked(getTaskListInGroup).mockResolvedValue(pageOf([row(1, 5, 5)]));
    const router = mount('/my-groups/12', { group: { taskType: 2, name: '旧组信息' } });
    fireEvent.click(await screen.findByRole('button', { name: '重新质检' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/exec/review/1'));
  });
});

describe('B8 连续作业', () => {
  it.each(['label', 'review'] as const)(
    '%s 连续提交 6 条（预派 3），只在确实无在手任务时结束',
    async (kind) => {
      let submitted = 0;
      const status = kind === 'label' ? 2 : 3;
      vi.mocked(submitLabelTask).mockImplementation(async () => {
        submitted += 1;
      });
      vi.mocked(submitReviewTask).mockImplementation(async () => {
        submitted += 1;
      });
      vi.mocked(getTaskListInGroup).mockImplementation(async (request) =>
        pageOf(
          request.status === status
            ? Array.from({ length: Math.min(3, 6 - submitted) }, (_, index) =>
                row(submitted + index + 1, kind === 'label' ? 2 : 4, status),
              )
            : [],
        ),
      );
      const router = mount(`/exec/${kind}/1`, { taskIds: [1, 2, 3], taskGroupId: 12 });
      for (let id = 1; id <= 6; id += 1) {
        await waitFor(() => expect(router.state.location.pathname).toBe(`/exec/${kind}/${id}`));
        const button = await screen.findByRole('button', {
          name: kind === 'label' ? /提交标注/ : /^通\s*过$/,
        });
        await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(button);
        await waitFor(() => expect(submitted).toBe(id));
        if (id < 6) expect(screen.queryByText(/本组已全部处理完/)).toBeNull();
      }
      expect(await screen.findByText(/本组已全部处理完/)).toBeTruthy();
      expect(
        vi
          .mocked(getTaskListInGroup)
          .mock.calls.every(([request]) => [status, 5].includes(request.status!)),
      ).toBe(true);
    },
  );

  it('慢补题不提前结束，刷新后的执行 URL 从服务端恢复组 id，重标任务可继续', async () => {
    let resolve!: (value: ReturnType<typeof pageOf>) => void;
    const delayed = new Promise<ReturnType<typeof pageOf>>((done) => {
      resolve = done;
    });
    vi.mocked(submitLabelTask).mockResolvedValue(undefined);
    vi.mocked(getTaskListInGroup).mockImplementation((request) =>
      request.status === 5 ? delayed : Promise.resolve(pageOf([])),
    );
    const router = mount('/exec/label/1');
    fireEvent.click(await screen.findByRole('button', { name: /提交标注/ }));
    await waitFor(() => expect(getTaskListInGroup).toHaveBeenCalled());
    expect(screen.queryByText(/本组已全部处理完/)).toBeNull();
    await act(async () => {
      resolve(pageOf([row(2, 2, 5)]));
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/exec/label/2'));
    expect(
      vi.mocked(getTaskListInGroup).mock.calls.every(([request]) => request.taskGroupId === 12),
    ).toBe(true);
  });

  it('提交成功但补题失败，显示可重试错误而不是完成；重试不重复提交', async () => {
    vi.mocked(submitLabelTask).mockResolvedValue(undefined);
    vi.mocked(getTaskListInGroup).mockRejectedValue(new Error('offline'));
    mount('/exec/label/1', { taskGroupId: 12 });
    fireEvent.click(await screen.findByRole('button', { name: /提交标注/ }));
    expect(await screen.findByText('提交已成功，后续任务加载失败')).toBeTruthy();
    expect(screen.queryByText(/本组已全部处理完/)).toBeNull();
    vi.mocked(getTaskListInGroup).mockResolvedValue(pageOf([]));
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(await screen.findByText(/本组已全部处理完/)).toBeTruthy();
    expect(submitLabelTask).toHaveBeenCalledTimes(1);
  });
});
