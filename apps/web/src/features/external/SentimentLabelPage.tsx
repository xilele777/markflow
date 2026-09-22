// 外部标注页面示范：用户评价情绪价值判断（积极 / 非积极）。
// —— 这个页面被父框架以 iframe 形式打开：${labelToolUrl}?taskId=...[&mode=review]
//    父框架顶栏负责「上一题 / 下一题 / 提交标注 / 通过·驳回」，本页只负责数据展示 + 草稿保存。
//
// 接入约定（业务方按这份做就行）：
//   1) 从 URL search 拿 taskId / mode；mode=review 走只读。
//   2) 调 getSampleData(taskId) 拿源数据。
//   3) 调 getTaskResult(taskId, 1) 回填上次草稿。
//   4) 用户修改 → saveTaskResult(taskId, 1, result)。后端透传不校验，result schema 双方约定。
//   5) 不需要 postMessage 跟父框架通信，父框架自己点提交 / 通过 / 驳回。
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircleFilled, FrownFilled, LoadingOutlined, SaveOutlined, SmileFilled } from '@ant-design/icons';
import { Spin } from 'antd';
import { getSampleData, getTaskResult, saveTaskResult } from '@/features/task/api';

// —— 设计 token（这是「独立外部页面」，不复用项目的 palette / shared 组件，
//    模拟业务方完全自己写一份的真实样子；色板也独立）。
const C = {
  bg: '#f7f8fa',
  surface: '#ffffff',
  border: '#e5e7eb',
  text: '#101828',
  sub: '#475569',
  weak: '#94a3b8',
  pos: '#22a06b',
  posBg: '#ecfdf3',
  neg: '#d92d20',
  negBg: '#fef3f2',
  brand: '#2563eb',
};
const F = {
  body: "'IBM Plex Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
};

/** 标注结果 schema（约定，业务方写文档时给后端 / AI / 质检方）：
 *   { sentiment: 'positive' | 'negative' }
 */
type Sentiment = 'positive' | 'negative';
interface SentimentResult {
  sentiment: Sentiment;
}

function isSentiment(v: unknown): v is Sentiment {
  return v === 'positive' || v === 'negative';
}

export default function SentimentLabelPage() {
  const [search] = useSearchParams();
  const taskIdRaw = search.get('taskId');
  const mode = search.get('mode'); // 'review' | null
  const readOnly = mode === 'review';
  const taskId = Number(taskIdRaw);
  const taskIdValid = Number.isFinite(taskId) && taskId > 0;

  // 1) 拉源数据
  const sampleQ = useQuery({
    queryKey: ['external-sentiment', 'sample', taskId],
    queryFn: () => getSampleData(taskId),
    enabled: taskIdValid,
  });

  // 2) 回填上次草稿 / 已完成的最终结果
  const resultQ = useQuery({
    queryKey: ['external-sentiment', 'result', taskId],
    queryFn: () => getTaskResult(taskId, 1),
    enabled: taskIdValid,
  });

  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  // Hydrate：第一次 result 返回后回填。
  useEffect(() => {
    if (!resultQ.data?.hasResult) return;
    const v = (resultQ.data.result as { sentiment?: unknown } | null)?.sentiment;
    if (isSentiment(v)) setSentiment(v);
  }, [resultQ.data]);

  // 3) 保存
  const [lastSaved, setLastSaved] = useState<Sentiment | null>(null);
  const saveMut = useMutation({
    mutationFn: (v: Sentiment) =>
      saveTaskResult({ taskId, sampleType: 1, result: { sentiment: v } satisfies SentimentResult }),
    onSuccess: (_void, v) => setLastSaved(v),
  });

  // 用户切换选项后自动保存（外部页面常见做法；让父框架点提交时已存草稿）。
  // 只读模式不触发。
  useEffect(() => {
    if (readOnly) return;
    if (!sentiment) return;
    if (sentiment === lastSaved) return;
    if (!taskIdValid) return;
    saveMut.mutate(sentiment);
    // saveMut 是稳定的，故意只盯 sentiment 触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentiment]);

  const sampleContent = useMemo(() => {
    const d = sampleQ.data?.sampleData;
    if (!d) return null;
    const v = (d as { content?: unknown }).content;
    return typeof v === 'string' ? v : JSON.stringify(d, null, 2);
  }, [sampleQ.data]);

  // 渲染
  if (!taskIdValid) {
    return <Shell><CenterMsg>缺少 taskId 参数</CenterMsg></Shell>;
  }
  if (sampleQ.isLoading || resultQ.isLoading) {
    return (
      <Shell>
        <CenterMsg>
          <Spin indicator={<LoadingOutlined spin />} /> 加载中…
        </CenterMsg>
      </Shell>
    );
  }
  if (sampleQ.isError || !sampleQ.data) {
    return <Shell><CenterMsg>样本数据加载失败</CenterMsg></Shell>;
  }

  const bizId = sampleQ.data.bizId ?? '—';

  return (
    <Shell>
      {/* 头条：业务 id + 模式 */}
      <div style={metaRow}>
        <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.sub }}>{bizId}</span>
        {readOnly ? (
          <span style={modePill('#e0f2fe', '#0369a1')}>质检 · 只读</span>
        ) : (
          <span style={modePill(C.posBg, C.pos)}>标注模式</span>
        )}
      </div>

      {/* 用户评价 */}
      <div style={card}>
        <div style={cardLabel}>用户评价</div>
        <p style={contentStyle}>{sampleContent || <span style={{ color: C.weak }}>（无内容）</span>}</p>
      </div>

      {/* 情绪选择 */}
      <div style={{ ...card, marginTop: 14 }}>
        <div style={cardLabel}>情绪判断</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <SentimentOption
            kind="positive"
            checked={sentiment === 'positive'}
            disabled={readOnly}
            onClick={() => setSentiment('positive')}
          />
          <SentimentOption
            kind="negative"
            checked={sentiment === 'negative'}
            disabled={readOnly}
            onClick={() => setSentiment('negative')}
          />
        </div>

        {/* 保存状态条（非只读才显示） */}
        {!readOnly && (
          <div style={savedRow}>
            {saveMut.isPending ? (
              <>
                <LoadingOutlined spin /> 正在保存…
              </>
            ) : saveMut.isError ? (
              <span style={{ color: C.neg }}>保存失败，再次点击即可重试</span>
            ) : lastSaved ? (
              <>
                <CheckCircleFilled style={{ color: C.pos }} /> 已保存草稿（{lastSaved === 'positive' ? '积极' : '非积极'}）
              </>
            ) : sentiment ? null : (
              <span style={{ color: C.weak }}>选择后将自动保存草稿</span>
            )}
          </div>
        )}
      </div>

      {/* 底部隐式标识：示范外部工具页 */}
      <div style={footer}>
        <SaveOutlined style={{ marginRight: 6 }} />
        外部标注工具示范 · sentiment v1
      </div>
    </Shell>
  );
}

// —— 子部件 ────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        padding: '32px 28px 40px',
        fontFamily: F.body,
        color: C.text,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>{children}</div>
    </div>
  );
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: 320,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: C.sub,
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

function SentimentOption({
  kind,
  checked,
  disabled,
  onClick,
}: {
  kind: Sentiment;
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const isPos = kind === 'positive';
  const accent = isPos ? C.pos : C.neg;
  const accentBg = isPos ? C.posBg : C.negBg;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '18px 16px',
        borderRadius: 10,
        border: `1.5px solid ${checked ? accent : C.border}`,
        background: checked ? accentBg : C.surface,
        color: checked ? accent : C.text,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: F.body,
        fontSize: 15,
        fontWeight: 600,
        transition: 'border-color .15s, background .15s, color .15s',
        opacity: disabled && !checked ? 0.55 : 1,
      }}
    >
      {isPos ? (
        <SmileFilled style={{ fontSize: 22, color: accent }} />
      ) : (
        <FrownFilled style={{ fontSize: 22, color: accent }} />
      )}
      <span>{isPos ? '积极' : '非积极'}</span>
      <span
        style={{
          marginLeft: 'auto',
          fontFamily: F.mono,
          fontSize: 11,
          color: checked ? accent : C.weak,
          fontWeight: 500,
        }}
      >
        {kind}
      </span>
    </button>
  );
}

// —— 样式 token ────────────────────────────────────────────────────────────

const metaRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 16,
};

const modePill = (bg: string, fg: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 11.5,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 999,
  background: bg,
  color: fg,
});

const card: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '18px 20px 20px',
};

const cardLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: C.weak,
  marginBottom: 10,
  textTransform: 'uppercase',
};

const contentStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.75,
  color: C.text,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const savedRow: CSSProperties = {
  marginTop: 14,
  fontSize: 12.5,
  color: C.sub,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const footer: CSSProperties = {
  marginTop: 28,
  textAlign: 'center',
  fontSize: 11.5,
  color: C.weak,
  fontFamily: F.mono,
};
