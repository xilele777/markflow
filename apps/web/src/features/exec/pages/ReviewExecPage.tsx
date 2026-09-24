// 质检执行页（全屏，《页面模板.md》四）。ExecToolbar + iframe，结构对齐 LabelExecPage。
// 区别：右侧操作 = 通过 / 不通过；不通过弹 RejectModal 收意见 → submitReviewTask({reviewAction:0|1, reviewComment})。
// 提交按响应分流：成功切下一题、失败 toast 后端 message 不切。已完成(status=4)只读复看。
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Input } from 'antd';
import { ArrowLeftOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingState } from '@/shared/components';
import { palette, fonts, sizing } from '@/app/theme';
import { getTaskDetail, getTaskResult, submitReviewTask } from '@/features/task/api';
import { useExecutionQueue } from '../useExecutionQueue';

/** reviewAction：0=驳回 1=通过。 */
const REVIEW_PASS = 1;
const REVIEW_REJECT = 0;

export default function ReviewExecPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { queue, cursor, setCursor, done, taskId, state, advance, queueError, advancing } =
    useExecutionQueue('review');

  const detailQ = useQuery({
    queryKey: ['task', 'detail', taskId],
    queryFn: () => getTaskDetail(taskId),
    enabled: Number.isFinite(taskId),
  });
  // 质检意见草稿（sampleType=2）：getTaskResult 第二次调用，回显之前填过的 reviewComment 等。
  // 渲染端只读拿 sampleType=1（标注结果）在子页 EmbedReviewPage 自己拉；
  // 父页这一份只用于回显 / 同步质检意见框。
  const reviewDraftQ = useQuery({
    queryKey: ['task', 'result', taskId, 2],
    queryFn: () => getTaskResult(taskId, 2),
    enabled: Number.isFinite(taskId),
  });

  // 队列内手动浏览。
  const goTo = (nextCursor: number) => {
    if (nextCursor < 0 || nextCursor >= queue.length) return;
    setCursor(nextCursor);
    navigate(`/exec/review/${queue[nextCursor]}`, {
      replace: true,
      state: { ...state, taskIds: queue.slice(nextCursor + 1) },
    });
  };
  const goPrev = () => goTo(cursor - 1);
  const goNext = () => goTo(cursor + 1);

  // 质检意见草稿（reviewComment 是非必填，通过/不通过都可填）。
  // 进入新任务时清空；getTaskResult(sampleType=2) 拿回后回填一次。
  const [reviewComment, setReviewComment] = useState('');
  const lastHydratedTaskId = useRef<number | null>(null);
  useEffect(() => {
    if (!taskId) return;
    if (lastHydratedTaskId.current === taskId) return;
    if (!reviewDraftQ.isSuccess) return;
    const draft = reviewDraftQ.data;
    const c =
      draft?.hasResult && draft.result && typeof draft.result === 'object'
        ? String((draft.result as Record<string, unknown>).reviewComment ?? '')
        : '';
    setReviewComment(c);
    lastHydratedTaskId.current = taskId;
  }, [taskId, reviewDraftQ.isSuccess, reviewDraftQ.data]);

  const submitMutation = useMutation({
    mutationFn: (vars: { taskId: number; reviewAction: number; reviewComment?: string }) =>
      submitReviewTask(vars),
    onSuccess: async (_, vars) => {
      message.success(vars.reviewAction === REVIEW_PASS ? '已通过' : '已不通过 · 已打回重标');
      setReviewComment('');
      lastHydratedTaskId.current = null;
      await advance();
    },
    onError: (e) => {
      message.error((e as Error)?.message || '提交失败');
    },
  });

  const submitReview = (action: number) => {
    if (!taskId) return;
    const c = reviewComment.trim();
    submitMutation.mutate({
      taskId,
      reviewAction: action,
      reviewComment: c || undefined,
    });
  };

  const backToGroup = () => {
    if (state.taskGroupId) {
      navigate(`/my-groups/${state.taskGroupId}`, {
        state: state.group ? { group: state.group } : undefined,
      });
    } else {
      navigate('/my-groups');
    }
  };

  const total = queue.length;
  const idx1 = Math.min(cursor + 1, total);
  const detail = detailQ.data;
  const bizId = detail?.bizId ?? '—';
  const round = detail?.round ?? 1;
  const isDone = detail?.status === 4;

  const iframeSrc = useMemo(() => {
    if (!detail) return null;
    if (detail.labelTool.labelToolType === 1) {
      return `/embed/review/${detail.taskId}`;
    }
    const u = detail.labelTool.labelToolUrl ?? '';
    if (!u) return null;
    const joiner = u.includes('?') ? '&' : '?';
    return `${u}${joiner}taskId=${detail.taskId}&mode=review`;
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
          <button onClick={backToGroup} title="退出" style={iconBtnStyle}>
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
            {state.group?.name ?? '质检执行'}
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
          <Button onClick={goPrev} disabled={queueError || advancing || done || cursor === 0}>
            上一题
          </Button>
          <Button
            onClick={goNext}
            disabled={queueError || advancing || done || cursor >= queue.length - 1}
          >
            下一题
          </Button>
          <span style={vDivider} />
          {isDone ? (
            <Button disabled>已完成</Button>
          ) : (
            <>
              <Button
                disabled={queueError || advancing || done || submitMutation.isPending}
                loading={
                  submitMutation.isPending && submitMutation.variables?.reviewAction === REVIEW_PASS
                }
                onClick={() => submitReview(REVIEW_PASS)}
                style={passBtnStyle}
              >
                通过
              </Button>
              <Button
                disabled={queueError || advancing || done || submitMutation.isPending}
                loading={
                  submitMutation.isPending &&
                  submitMutation.variables?.reviewAction === REVIEW_REJECT
                }
                onClick={() => submitReview(REVIEW_REJECT)}
                style={rejectBtnStyle}
              >
                不通过
              </Button>
            </>
          )}
        </div>
      </header>

      {/* 质检意见（非必填）：通过 / 不通过都可填；从 sampleType=2 草稿回显。 */}
      {!done && !isDone && (
        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 18px',
            background: palette.surface,
            borderBottom: `1px solid ${palette.hairline}`,
          }}
        >
          <span style={{ fontSize: 12.5, color: palette.weak, flex: 'none' }}>质检意见</span>
          <Input
            placeholder="可选填，如：第 2 轮对话角色标注错误"
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            maxLength={500}
            disabled={submitMutation.isPending}
            style={{ flex: 1 }}
          />
        </div>
      )}

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {queueError ? (
          <ErrorState message="提交已成功，后续任务加载失败" onRetry={() => void advance()} />
        ) : advancing ? (
          <LoadingState />
        ) : done ? (
          <DonePanel onBack={backToGroup} />
        ) : detailQ.isLoading ? (
          <LoadingState />
        ) : detailQ.isError || !detail ? (
          <ErrorState message="任务加载失败" onRetry={() => detailQ.refetch()} />
        ) : iframeSrc ? (
          <iframe
            key={detail.taskId}
            src={iframeSrc}
            title="质检工具"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: 'none',
            }}
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

// 通过=就绪绿；不通过=失败红。颜色取自配色规范的 STATUS。
const passBtnStyle: CSSProperties = {
  background: '#2c7a52',
  borderColor: '#2c7a52',
  color: '#fff',
};
const rejectBtnStyle: CSSProperties = {
  borderColor: '#a8423a',
  color: '#a8423a',
};

function DonePanel({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <CheckCircleFilled style={{ fontSize: 48, color: '#2c7a52' }} />
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: fonts.display,
              fontSize: 18,
              fontWeight: 700,
              color: palette.text,
            }}
          >
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
