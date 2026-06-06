// 标注执行页（全屏，《页面模板.md》四）。ExecToolbar + iframe。
// 队列：进入时从详情页 navigate(state) 接 taskIds；剩 ≤2 时自动补一页待办拼到队尾。
// 提交：直接 submitLabelTask；成功切下一题，失败 toast 显示后端 message、不切。
// 工具分流：type=1 内置 → /embed/label/:taskId（同源），type=2 IFRAME → labelToolUrl?taskId=...
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { App, Button } from 'antd';
import { ArrowLeftOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingState } from '@/shared/components';
import { palette, fonts, sizing } from '@/app/theme';
import { getTaskDetail, submitLabelTask } from '@/features/task/api';
import { getTaskListInGroup } from '@/features/taskgroup/api';
import type { MyTaskGroupItem } from '@/features/taskgroup/types';

interface ExecState {
  /** 进入时由详情页提供：当前组在手 + 待办的 taskId 顺序队列。 */
  taskIds?: number[];
  /** 用于「补货」（再拉一页 status=1 待办）。 */
  taskGroupId?: number;
  /** 用于顶栏显示组名 / 返回。 */
  group?: MyTaskGroupItem;
}

const QUEUE_REFILL_THRESHOLD = 2;
const REFILL_PAGE_SIZE = 20;

export default function LabelExecPage() {
  const { taskId: taskIdParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as ExecState;
  const { message } = App.useApp();

  // 队列：从 URL 当前题为起点，state.taskIds 给一段未来的顺序。
  // 第一题是 URL :taskId；后续来自 state.taskIds.filter(id => id !== current)。
  const initialQueue = useMemo<number[]>(() => {
    const cur = Number(taskIdParam);
    const tail = (state.taskIds ?? []).filter((id) => id !== cur);
    return Number.isFinite(cur) ? [cur, ...tail] : tail;
  }, [taskIdParam, state.taskIds]);

  const [queue, setQueue] = useState<number[]>(initialQueue);
  const [cursor, setCursor] = useState(0);
  const [done, setDone] = useState(false);
  // 「本组完结」终态：队列跑完且补货也回了空。
  const taskId = queue[cursor];

  // 当 URL 的 :taskId 与队列首位不一致时（手动改 URL 等），把队列重置。
  useEffect(() => {
    const cur = Number(taskIdParam);
    if (Number.isFinite(cur) && queue[cursor] !== cur) {
      setQueue((q) => {
        const tail = q.filter((id) => id !== cur).slice(cursor);
        return [cur, ...tail];
      });
      setCursor(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdParam]);

  // 当前任务详情（拿 labelToolType / labelToolUrl / bizId / round 用于顶栏 + iframe src 分流）。
  const detailQ = useQuery({
    queryKey: ['task', 'detail', taskId],
    queryFn: () => getTaskDetail(taskId),
    enabled: Number.isFinite(taskId),
  });

  // 当剩余 ≤ 阈值时补货：拉一页 status=1 待办，append 没见过的。
  const refilling = useRef(false);
  useEffect(() => {
    if (done) return;
    const remaining = queue.length - cursor - 1;
    if (remaining > QUEUE_REFILL_THRESHOLD) return;
    if (!state.taskGroupId) return; // 没有 groupId 就无法补货
    if (refilling.current) return;
    refilling.current = true;
    getTaskListInGroup({
      taskGroupId: state.taskGroupId,
      status: 1, // 待办
      pageNum: 1,
      pageSize: REFILL_PAGE_SIZE,
    })
      .then((res) => {
        setQueue((q) => {
          const seen = new Set(q);
          const fresh = res.list.map((t) => t.taskId).filter((tid) => !seen.has(tid));
          return fresh.length ? [...q, ...fresh] : q;
        });
      })
      .catch(() => {
        // 静默：补货失败不影响当前题作业。
      })
      .finally(() => {
        refilling.current = false;
      });
  }, [queue.length, cursor, done, state.taskGroupId]);

  const advance = useCallback(() => {
    setQueue((q) => {
      const nextCursor = cursor + 1;
      if (nextCursor >= q.length) {
        setDone(true);
        return q;
      }
      const nextId = q[nextCursor];
      setCursor(nextCursor);
      // URL 跟着切（state 透传，便于刷新后队列里至少自己还在）。
      navigate(`/exec/label/${nextId}`, {
        replace: true,
        state: { ...state, taskIds: q.slice(nextCursor + 1) },
      });
      return q;
    });
  }, [cursor, navigate, state]);

  const submitMutation = useMutation({
    mutationFn: (tid: number) => submitLabelTask(tid),
    onSuccess: () => {
      message.success('已提交标注');
      advance();
    },
    onError: (e) => {
      // 后端 message 原文显示（常见：未保存结果 / 校验未通过）；不切题。
      message.error((e as Error)?.message || '提交失败');
    },
  });

  const backToGroup = () => {
    if (state.taskGroupId) {
      navigate(`/my-groups/${state.taskGroupId}`, { state: state.group ? { group: state.group } : undefined });
    } else {
      navigate('/my-groups');
    }
  };

  // 队列内手动浏览：上一题 / 下一题。URL 用 replace 切换，state.taskIds 始终带「当前之后的尾巴」让刷新可重建。
  const goTo = (nextCursor: number) => {
    if (nextCursor < 0 || nextCursor >= queue.length) return;
    setCursor(nextCursor);
    navigate(`/exec/label/${queue[nextCursor]}`, {
      replace: true,
      state: { ...state, taskIds: queue.slice(nextCursor + 1) },
    });
  };
  const goPrev = () => goTo(cursor - 1);
  const goNext = () => goTo(cursor + 1);

  const total = queue.length;
  const idx1 = Math.min(cursor + 1, total);
  const detail = detailQ.data;
  const bizId = detail?.bizId ?? '—';
  const round = detail?.round ?? 1;
  // status=4 已完成：只看不能再提交（执行页提交按钮禁用 / 子页渲染按 review 走只读）。
  const isDone = detail?.status === 4;

  // iframe src 分流（labelToolType=1 内置 / 2 IFRAME）。
  const iframeSrc = useMemo(() => {
    if (!detail) return null;
    if (detail.labelTool.labelToolType === 1) {
      return `/embed/label/${detail.taskId}`;
    }
    const u = detail.labelTool.labelToolUrl ?? '';
    if (!u) return null;
    const joiner = u.includes('?') ? '&' : '?';
    return `${u}${joiner}taskId=${detail.taskId}`;
  }, [detail]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: palette.canvas,
        fontFamily: fonts.body,
        color: palette.text,
      }}
    >
      {/* 顶栏 */}
      <header
        style={{
          flex: 'none',
          height: 52,
          background: palette.surface,
          borderBottom: `1px solid ${palette.hairline}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 18px',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <button
            onClick={backToGroup}
            title="退出"
            style={iconBtnStyle}
          >
            <ArrowLeftOutlined style={{ fontSize: 14, color: palette.sub }} />
          </button>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: palette.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 240,
            }}
          >
            {state.group?.name ?? '标注执行'}
          </span>
          <span style={vDivider} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontFamily: fonts.mono,
              fontSize: 12.5,
              color: palette.weak,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: palette.sub, fontWeight: 500 }}>{bizId}</span>
            <span>
              第 {idx1} / {total} 题
            </span>
            <span>第 {round} 轮</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <Button onClick={goPrev} disabled={done || cursor === 0}>
            上一题
          </Button>
          <Button onClick={goNext} disabled={done || cursor >= queue.length - 1}>
            下一题
          </Button>
          <span style={vDivider} />
          <Button
            disabled={done || isDone || submitMutation.isPending}
            loading={submitMutation.isPending}
            type="primary"
            onClick={() => taskId && submitMutation.mutate(taskId)}
            title={isDone ? '该任务已提交完成' : undefined}
          >
            {isDone ? '已完成' : '提交标注'}
          </Button>
        </div>
      </header>

      {/* 主体：iframe / 加载 / 完结终态 */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {done ? (
          <DonePanel onBack={backToGroup} />
        ) : detailQ.isLoading ? (
          <LoadingState />
        ) : detailQ.isError || !detail ? (
          <ErrorState message="任务加载失败" onRetry={() => detailQ.refetch()} />
        ) : iframeSrc ? (
          <iframe
            key={detail.taskId}
            src={iframeSrc}
            title="标注工具"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <ErrorState message="标注工具未配置（labelToolUrl 为空）" />
        )}
      </div>
    </div>
  );
}

const iconBtnStyle: CSSProperties = {
  width: 32,
  height: 32,
  flex: 'none',
  borderRadius: sizing.radius,
  border: `1px solid ${palette.border}`,
  background: palette.surface,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
};

const vDivider: CSSProperties = {
  width: 1,
  height: 20,
  background: palette.hairline,
  flex: 'none',
};

function DonePanel({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <CheckCircleFilled style={{ fontSize: 48, color: '#2c7a52' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 700, color: palette.text }}>
            本组已全部处理完
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: palette.sub }}>
            可返回任务组查看进度。
          </div>
        </div>
        <Button type="primary" onClick={onBack}>
          返回任务组
        </Button>
      </div>
    </div>
  );
}
