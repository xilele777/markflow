import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getTaskDetail } from '@/features/task/api';
import { getTaskListInGroup } from '@/features/taskgroup/api';
import type { MyTaskGroupItem } from '@/features/taskgroup/types';

interface ExecState {
  taskIds?: number[];
  taskGroupId?: number;
  group?: MyTaskGroupItem;
}

/** 两种执行页共用：提交响应已完成补题后，再查询在手任务，查询失败可单独重试。 */
export function useExecutionQueue(kind: 'label' | 'review') {
  const { taskId: taskIdParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as ExecState;
  const initial = () => {
    const current = Number(taskIdParam);
    return [...new Set([current, ...(state.taskIds ?? [])])].filter(Number.isFinite);
  };
  const [queue, setQueue] = useState<number[]>(initial);
  const [cursor, setCursor] = useState(0);
  const [done, setDone] = useState(false);
  const [queueError, setQueueError] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const taskId = queue[cursor];

  useEffect(() => {
    const current = Number(taskIdParam);
    if (Number.isFinite(current) && current !== taskId) {
      setQueue(initial());
      setCursor(0);
      setDone(false);
      setQueueError(false);
    }
    // 队列切题与 URL 同步；仅在 URL 外部变更时重建。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdParam]);

  const advance = async () => {
    setAdvancing(true);
    setQueueError(false);
    try {
      const taskGroupId = state.taskGroupId ?? (await getTaskDetail(taskId)).taskGroupId;
      const pages = await Promise.all(
        [kind === 'label' ? 2 : 3, 5].map((status) =>
          getTaskListInGroup({ taskGroupId, status, pageNum: 1, pageSize: 20 }),
        ),
      );
      // 使用最新在手列表，避免旧队列里已回收/已完成的任务；过去做过但又被打回的任务也可再次进入。
      const pending = pages
        .flatMap((page) => page.list)
        .sort((a, b) => a.taskGroupSeq - b.taskGroupSeq);
      const nextIds = [...new Set(pending.map((task) => task.taskId))];
      if (nextIds.length === 0) {
        setDone(true);
        return;
      }
      const history = queue.slice(0, cursor + 1);
      setQueue([...history, ...nextIds]);
      setCursor(history.length);
      navigate(`/exec/${kind}/${nextIds[0]}`, {
        replace: true,
        state: { ...state, taskGroupId, taskIds: nextIds.slice(1) },
      });
    } catch {
      setQueueError(true);
    } finally {
      setAdvancing(false);
    }
  };

  return { queue, cursor, setCursor, done, taskId, state, advance, queueError, advancing };
}
