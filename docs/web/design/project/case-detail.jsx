// case-detail.jsx — 标注任务（Case）详情页（非全屏，嵌于框架内）
// 上：基本信息　中：流程进度（taskPlanConfig.stages × stageProgress）　下：人员分配（assignmentConfig）
// 依赖 app-shell.jsx（Sidebar/Topbar/Btn/Tag/fmt）与 case-list.jsx（CASE_SOURCE/CASE_STATUS/CaseStatusPill）
// Exports to window: CaseDetailPage

// stage 类型元信息（type → 规范编号 / 中文名 / AI or 人工）
const STAGE_META = {
  aiPreLabel:  { code: 1, label: 'AI 预标注', kind: 'ai' },
  label:       { code: 2, label: '人工标注', kind: 'human' },
  aiPreReview: { code: 3, label: 'AI 预审',  kind: 'ai' },
  review:      { code: 4, label: '人工初检', kind: 'human' },
  recheck:     { code: 5, label: '人工复检', kind: 'human' },
};
const STRATEGY = { 1: '先到先得', 2: '固定分配' };

// ── mock：与列表中的 CASE-2048（运行中 / 数据集 / 对话标注器）对应 ──
const CASE = {
  caseId: 'CASE-2048', spaceCode: 'MED-CORE', name: '门诊对话全流程标注',
  description: '面向门诊问诊对话的完整五段流程：模型预标注打底，人工逐条标注，AI 预审筛查，人工初检与复检兜底。覆盖分诊、用药咨询与随访场景。',
  dataSourceType: 1, datasetVersion: 'v5', datasetVersionId: 50231,
  labelToolCode: '对话标注器', status: 2, creator: '张未明',
  createTime: '2026-05-30 09:12', updateTime: '2026-06-01 14:20',
  resultVersion: 'v1', resultVersionId: 51002,
  // taskPlanConfig.stages（按顺序）
  stages: ['aiPreLabel', 'label', 'aiPreReview', 'review', 'recheck'],
  // stageProgress（与 stages 顺序对应）
  progress: {
    aiPreLabel:  { poolPending: 0,    personalDoing: 0,   done: 5200 },
    label:       { poolPending: 760,  personalDoing: 280, done: 4160 },
    aiPreReview: { poolPending: 120,  personalDoing: 0,   done: 3900 },
    review:      { poolPending: 1300, personalDoing: 110, done: 2790 },
    recheck:     { poolPending: 1900, personalDoing: 60,  done: 1240 },
  },
  // assignmentConfig（key 为 camelCase 类型名）
  assignment: {
    aiPreLabel: { aiCode: '通用预标注模型', preDispatchSize: 200, autoRecycleMinutes: 30 },
    label: { strategy: 2, preDispatchSize: 20, autoRecycleMinutes: 120, members: [
      { username: '张未明', ratio: 40, active: true },
      { username: '李 航',  ratio: 35, active: true },
      { username: '王 芮',  ratio: 25, active: true },
      { username: '何 洁',  ratio: 0,  active: false },
    ] },
    aiPreReview: { aiCode: '预审质检模型', preDispatchSize: 150, autoRecycleMinutes: 20 },
    review: { strategy: 1, preDispatchSize: 15, autoRecycleMinutes: 60, members: [
      { username: '周 岚', ratio: null, active: true },
      { username: '陈 思', ratio: null, active: true },
    ] },
    recheck: { strategy: 2, preDispatchSize: 10, autoRecycleMinutes: 90, members: [
      { username: '林 深', ratio: 60, active: true },
      { username: '郑 凯', ratio: 40, active: true },
    ] },
  },
};

function MetaItem({ theme, label, value, mono, muted }) {
  return (
    <div>
      <div style={{ fontFamily: theme.font.body, fontSize: 12, color: theme.weak, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: mono ? theme.font.mono : theme.font.body, fontSize: 13.5,
        color: muted ? theme.weak : theme.text, fontWeight: mono ? 400 : 500 }}>{value}</div>
    </div>
  );
}

function KindTag({ theme, kind }) {
  const ai = kind === 'ai';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center',
      fontFamily: theme.font.mono, fontSize: 11, fontWeight: 500, lineHeight: 1,
      padding: '3px 6px', borderRadius: theme.radius - 2,
      background: ai ? theme.accentSoft : theme.fill, color: ai ? theme.accent : theme.sub }}>
      {ai ? 'AI' : '人工'}
    </span>
  );
}

// 进度条：已完成(绿) / 个人在做(蓝) / 池中待领(灰底)
const SEG = { done: '#2c7a52', doing: '#3a5ea8', pending: '#dfe2e8' };

function Bar({ p, h = 10 }) {
  const total = Math.max(p.poolPending + p.personalDoing + p.done, 1);
  const seg = (v, c) => v > 0 ? <span key={c} style={{ width: (v / total * 100) + '%', background: c }} /> : null;
  return (
    <div style={{ display: 'flex', height: h, borderRadius: h / 2, overflow: 'hidden', background: SEG.pending }}>
      {seg(p.done, SEG.done)}
      {seg(p.personalDoing, SEG.doing)}
    </div>
  );
}

function Stat({ theme, color, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: color, flex: 'none' }} />
      <span style={{ fontFamily: theme.font.body, fontSize: 12.5, color: theme.weak }}>{label}</span>
      <span style={{ fontFamily: theme.font.mono, fontSize: 13, color: theme.text }}>{value}</span>
    </div>
  );
}

function Chip({ theme, k, v }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6,
      padding: '5px 10px', borderRadius: theme.radius, background: theme.fill }}>
      <span style={{ fontFamily: theme.font.body, fontSize: 12, color: theme.weak }}>{k}</span>
      <span style={{ fontFamily: theme.font.body, fontSize: 12.5, color: theme.text, fontWeight: 500 }}>{v}</span>
    </span>
  );
}

function MemberPill({ theme, m, showRatio }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px 4px 8px', borderRadius: 20, border: `1px solid ${theme.border}`,
      background: theme.surface, opacity: m.active ? 1 : 0.5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', flex: 'none',
        background: m.active ? SEG.done : theme.weak }} />
      <span style={{ fontFamily: theme.font.body, fontSize: 12.5, color: theme.text }}>{m.username}</span>
      {showRatio && m.active && <span style={{ fontFamily: theme.font.mono, fontSize: 12, color: theme.sub }}>{m.ratio}%</span>}
    </span>
  );
}

const NODE = 30, CENTER = 28; // 节点直径 / 节点中心距行顶
function StageRow({ theme, type, index, isLast }) {
  const meta = STAGE_META[type];
  const p = CASE.progress[type];
  const a = CASE.assignment[type];
  const ai = meta.kind === 'ai';
  const total = p.poolPending + p.personalDoing + p.done;
  const pct = total ? Math.round(p.done / total * 100) : 0;
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const innerRef = React.useRef(null);

  return (
    <div style={{ display: 'flex', gap: 16, paddingBottom: isLast ? 0 : 16 }}>
      {/* 左侧连接轨 + 节点 */}
      <div style={{ width: NODE, flex: 'none', position: 'relative' }}>
        <span style={{ position: 'absolute', left: NODE / 2 - 1, width: 2, background: theme.border,
          top: index === 0 ? CENTER : 0, bottom: isLast ? `calc(100% - ${CENTER}px)` : 0 }} />
        <span style={{ position: 'absolute', top: CENTER - NODE / 2, left: 0, width: NODE, height: NODE,
          borderRadius: '50%', display: 'grid', placeItems: 'center', boxSizing: 'border-box',
          background: ai ? theme.accent : theme.surface,
          border: `1.5px solid ${ai ? theme.accent : theme.border}`,
          color: ai ? '#fff' : theme.sub, fontFamily: theme.font.mono, fontSize: 13 }}>{meta.code}</span>
      </div>

      {/* 阶段卡 */}
      <div style={{ flex: 1, minWidth: 0, borderRadius: theme.radius + 1, background: theme.surface,
        border: `1px solid ${open || hover ? theme.border : theme.hairline}`, overflow: 'hidden',
        transition: 'border-color .18s' }}>
        {/* 可点击的概览区：仅进度 + 三项计数 */}
        <div onClick={() => setOpen((o) => !o)}
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          style={{ padding: '15px 18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 13 }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: theme.font.display, fontSize: 15.5, fontWeight: 600, color: theme.text }}>{meta.label}</span>
            <KindTag theme={theme} kind={meta.kind} />
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: theme.font.mono, fontSize: 18, color: theme.text, lineHeight: 1 }}>{pct}%</span>
              <span style={{ fontFamily: theme.font.body, fontSize: 12.5, color: theme.weak }}>
                已完成 <span style={{ fontFamily: theme.font.mono, color: theme.sub }}>{fmt(p.done)}</span> / {fmt(total)}
              </span>
            </div>
            <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, flex: 'none',
              color: open ? theme.accent : theme.weak,
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .26s' }}>
              <Glyph name="chevron" size={14} color="currentColor" />
            </span>
          </div>
          {/* 进度 */}
          <Bar p={p} />
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Stat theme={theme} color={SEG.done}    label="已完成"   value={fmt(p.done)} />
            <Stat theme={theme} color={SEG.doing}   label="个人在做" value={fmt(p.personalDoing)} />
            <Stat theme={theme} color={SEG.pending} label="池中待领" value={fmt(p.poolPending)} />
          </div>
        </div>

        {/* 可展开详情：人员分配（measured max-height 过渡） */}
        <div style={{ overflow: 'hidden', transition: 'max-height .28s ease',
          maxHeight: open ? (innerRef.current ? innerRef.current.scrollHeight : 999) : 0 }}>
          <div ref={innerRef} style={{ padding: '0 18px 16px' }}>
            <div style={{ height: 1, background: theme.hairline, marginBottom: 14 }} />
            <div style={{ fontFamily: theme.font.body, fontSize: 12, color: theme.weak, marginBottom: 10 }}>
              {ai ? 'AI 配置' : '人员分配'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {ai ? (
                <React.Fragment>
                  <Chip theme={theme} k="模型" v={a.aiCode} />
                  <Chip theme={theme} k="预派发" v={fmt(a.preDispatchSize)} />
                  <Chip theme={theme} k="自动回收" v={a.autoRecycleMinutes + ' 分钟'} />
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <Chip theme={theme} k="分配策略" v={STRATEGY[a.strategy]} />
                  <Chip theme={theme} k="预派发" v={fmt(a.preDispatchSize)} />
                  <Chip theme={theme} k="自动回收" v={a.autoRecycleMinutes + ' 分钟'} />
                  <span style={{ width: 1, height: 18, background: theme.hairline, margin: '0 3px' }} />
                  {a.members.map((m) => (
                    <MemberPill key={m.username} theme={theme} m={m} showRatio={a.strategy === 2} />
                  ))}
                </React.Fragment>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CaseDetailPage({ theme }) {
  const c = CASE;
  const src = CASE_SOURCE[c.dataSourceType];
  const grandDone = c.stages.reduce((s, t) => s + c.progress[t].done, 0);
  const grandTotal = c.stages.reduce((s, t) => {
    const p = c.progress[t]; return s + p.poolPending + p.personalDoing + p.done;
  }, 0);

  return (
    <div style={{ display: 'flex', height: '100%', background: theme.canvas, fontFamily: theme.font.body, color: theme.text }}>
      <Sidebar theme={theme} active="标注任务" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar theme={theme} crumbs={[{ label: '任务' }, { label: '标注任务', href: '标注任务列表.html' }, { label: c.name }]} />
        <main style={{ flex: 1, overflow: 'auto', padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── 上：基本信息 ── */}
          <section style={{ background: theme.surface, border: `1px solid ${theme.hairline}`,
            borderRadius: theme.radius + 1, padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontFamily: theme.font.display, fontWeight: 700, fontSize: 22,
                    color: theme.text, lineHeight: 1.2 }}>{c.name}</h1>
                  <Tag tone={src} theme={{ font: theme.font, radius: theme.radius }} />
                  <CaseStatusPill theme={theme} status={c.status} />
                </div>
                <p style={{ margin: '8px 0 0', fontFamily: theme.font.body, fontSize: 13.5, lineHeight: 1.65,
                  color: theme.sub, maxWidth: 760 }}>{c.description}</p>
              </div>
              <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
                <Btn theme={theme} kind="ghost">暂停任务</Btn>
                <Btn theme={theme} kind="ghost">编辑信息</Btn>
              </div>
            </div>
            <div style={{ height: 1, background: theme.hairline, margin: '20px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '18px 24px' }}>
              <MetaItem theme={theme} label="任务编号" value={c.caseId} mono />
              <MetaItem theme={theme} label="所属空间" value={c.spaceCode} mono />
              <MetaItem theme={theme} label="标注工具" value={c.labelToolCode} />
              <MetaItem theme={theme} label="数据集版本"
                value={c.dataSourceType === 1 ? `${c.datasetVersion} · #${c.datasetVersionId}` : '—'}
                mono muted={c.dataSourceType !== 1} />
              <MetaItem theme={theme} label="结果集版本"
                value={c.resultVersionId ? `${c.resultVersion} · #${c.resultVersionId}` : '未生成'}
                mono muted={!c.resultVersionId} />
              <MetaItem theme={theme} label="创建人" value={c.creator} />
              <MetaItem theme={theme} label="创建时间" value={c.createTime} mono />
              <MetaItem theme={theme} label="更新时间" value={c.updateTime} mono />
            </div>
          </section>

          {/* ── 中：流程进度 ── */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2 }}>
            <h2 style={{ margin: 0, fontFamily: theme.font.display, fontSize: 15, fontWeight: 600, color: theme.text }}>流程进度</h2>
            <span style={{ fontFamily: theme.font.body, fontSize: 12.5, color: theme.sub }}>
              全流程已完成 <span style={{ fontFamily: theme.font.mono, color: theme.text }}>{fmt(grandDone)}</span>
              <span style={{ color: theme.weak }}> / {fmt(grandTotal)}</span>
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {c.stages.map((t, i) => (
              <StageRow key={t} theme={theme} type={t} index={i} isLast={i === c.stages.length - 1} />
            ))}
          </div>

        </main>
      </div>
    </div>
  );
}

Object.assign(window, { CaseDetailPage });
