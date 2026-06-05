// exec.jsx — 全屏任务执行页（标注 / 质检两版，mode: 'label' | 'qc'）。
// 整屏接管：无侧栏、无平台顶栏。依赖 window：Glyph（tokens）。
// Exports：ExecPage

// 组内任务（bizId + round）。最后一题用于演示「本组已全部处理完」。
const EXEC_TASKS = [
  { bizId: 'OPD-20260604-0008', round: 1 },
  { bizId: 'OPD-20260604-0007', round: 1 },
  { bizId: 'OPD-20260604-0006', round: 2 },
  { bizId: 'OPD-20260604-0005', round: 1 },
  { bizId: 'OPD-20260604-0004', round: 1 },
  { bizId: 'OPD-20260603-0021', round: 1 },
  { bizId: 'OPD-20260603-0020', round: 1 },
  { bizId: 'OPD-20260603-0019', round: 1 },
];

const SUCCESS = '#2c7a52', SUCCESS_SOFT = '#e7f4ec';
const DANGER  = '#a8423a', DANGER_SOFT  = '#fbe9e7';

// 顶栏按钮
function TopBtn({ theme, children, onClick, disabled, variant }) {
  let st = { background: theme.surface, color: theme.sub, border: `1px solid ${theme.border}` };
  if (variant === 'primary') st = { background: theme.surface, color: theme.text, border: `1px solid ${theme.text}` };
  if (variant === 'success') st = { background: SUCCESS, color: '#fff', border: `1px solid ${SUCCESS}` };
  if (variant === 'danger')  st = { background: theme.surface, color: DANGER, border: `1px solid ${DANGER}` };
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{ height: 34, padding: '0 16px', borderRadius: theme.radius, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: theme.font.body, fontSize: 13, fontWeight: variant ? 600 : 500, whiteSpace: 'nowrap',
        opacity: disabled ? 0.4 : 1, transition: 'opacity .12s', ...st }}>{children}</button>
  );
}

// 嵌入区内部的「标注工具渲染区」占位（保存按钮在其内部）
function IframeStub({ theme, bizId, mode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* iframe 顶部标识条 */}
      <div style={{ flex: 'none', height: 30, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px',
        background: theme.surface, borderBottom: `1px dashed ${theme.border}` }}>
        <span style={{ width: 7, height: 7, borderRadius: 2, background: theme.accent, flex: 'none' }} />
        <span style={{ fontFamily: theme.font.mono, fontSize: 11, letterSpacing: '0.06em', color: theme.weak, whiteSpace: 'nowrap' }}>
          标注工具渲染区 · IFRAME
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: theme.font.mono, fontSize: 11, color: theme.weak, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: 12 }}>
          puck://render/{bizId}
        </span>
      </div>
      {/* 渲染区主体 */}
      <div style={{ flex: 1, position: 'relative', display: 'grid', placeItems: 'center',
        background: `repeating-linear-gradient(45deg, ${theme.canvas}, ${theme.canvas} 12px, ${theme.surface} 12px, ${theme.surface} 24px)` }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          padding: '28px 34px', background: theme.surface, border: `1px solid ${theme.hairline}`,
          borderRadius: theme.radius + 2, boxShadow: '0 1px 3px rgba(20,26,31,0.05)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: theme.fill,
            display: 'grid', placeItems: 'center', border: `1px solid ${theme.hairline}` }}>
            <Glyph name="file" size={20} color={theme.weak} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: theme.font.body, fontSize: 14, fontWeight: 500, color: theme.sub }}>
              {mode === 'qc' ? '质检工具' : '标注工具'}在此区域加载
            </div>
            <div style={{ marginTop: 4, fontFamily: theme.font.mono, fontSize: 12, color: theme.weak }}>{bizId}</div>
          </div>
        </div>
        {/* 内部「保存」按钮——属于 iframe，不在平台操作条 */}
        <div style={{ position: 'absolute', right: 18, bottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: theme.font.body, fontSize: 11.5, color: theme.weak }}>↳ 保存属于工具内部</span>
          <button style={{ height: 34, padding: '0 18px', borderRadius: theme.radius, cursor: 'pointer',
            background: theme.accent, color: '#fff', border: `1px solid ${theme.accent}`,
            fontFamily: theme.font.body, fontSize: 13, fontWeight: 600 }}>保存结果</button>
        </div>
      </div>
    </div>
  );
}

// 不通过意见弹框
function RejectModal({ theme, onCancel, onConfirm }) {
  const [text, setText] = React.useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,26,31,0.32)',
      display: 'grid', placeItems: 'center' }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, background: theme.surface,
        borderRadius: theme.radius + 3, boxShadow: '0 12px 40px rgba(20,26,31,0.22)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px 0' }}>
          <h3 style={{ margin: 0, fontFamily: theme.font.display, fontSize: 16, fontWeight: 600, color: theme.text }}>填写质检意见</h3>
          <p style={{ margin: '6px 0 0', fontFamily: theme.font.body, fontSize: 12.5, color: theme.sub }}>
            不通过将打回重标，请说明问题（必填）。
          </p>
        </div>
        <div style={{ padding: '14px 22px 20px' }}>
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder="如：第 2 轮对话角色标注错误，用药剂量未抽取…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', resize: 'vertical',
              borderRadius: theme.radius, border: `1px solid ${theme.border}`, outline: 'none',
              fontFamily: theme.font.body, fontSize: 13.5, lineHeight: 1.6, color: theme.text }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '0 22px 20px' }}>
          <TopBtn theme={theme} onClick={onCancel}>取消</TopBtn>
          <TopBtn theme={theme} variant="danger" disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>确认不通过</TopBtn>
        </div>
      </div>
    </div>
  );
}

function ExecPage({ theme, mode = 'label' }) {
  const qc = mode === 'qc';
  const params = new URLSearchParams(location.search);
  const groupName = params.get('name') || (qc ? '门诊对话 · 初检组' : '门诊对话 · 标注 A 组');
  const backHref = '我的任务组详情.html' + (location.search || '');

  const tasks = EXEC_TASKS;
  const [idx, setIdx] = React.useState(0);
  const [done, setDone] = React.useState(false);   // 全部处理完
  const [showReject, setShowReject] = React.useState(false);
  const [toast, setToast] = React.useState('');

  const cur = tasks[idx];
  const isFirst = idx === 0;
  const isLast = idx === tasks.length - 1;

  const flash = (msg) => { setToast(msg); window.clearTimeout(flash._t); flash._t = window.setTimeout(() => setToast(''), 1800); };

  const advance = (msg) => {
    flash(msg);
    if (isLast) setDone(true);
    else setIdx((i) => i + 1);
  };
  const submitLabel = () => advance('已提交标注');
  const pass = () => advance('已通过');
  const rejectConfirm = () => { setShowReject(false); advance('已不通过 · 打回重标'); };
  const prev = () => { if (!isFirst) setIdx((i) => i - 1); };
  const next = () => { if (!isLast) setIdx((i) => i + 1); };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      background: theme.canvas, fontFamily: theme.font.body, color: theme.text }}>

      {/* ── 上段：操作条 ── */}
      <header style={{ flex: 'none', height: 52, background: theme.surface,
        borderBottom: `1px solid ${theme.hairline}`, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 18px', gap: 16 }}>
        {/* 左：退出 + 题信息 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <a href={backHref} title="退出" style={{ width: 32, height: 32, flex: 'none', borderRadius: theme.radius,
            border: `1px solid ${theme.border}`, background: theme.surface, display: 'grid', placeItems: 'center' }}>
            <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}><Glyph name="arrow" size={14} color={theme.sub} /></span>
          </a>
          <span style={{ fontFamily: theme.font.body, fontSize: 13, fontWeight: 600, color: theme.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{groupName}</span>
          <span style={{ width: 1, height: 20, background: theme.hairline, flex: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: theme.font.mono, fontSize: 12.5, color: theme.weak, whiteSpace: 'nowrap' }}>
            <span style={{ color: theme.sub, fontWeight: 500 }}>{cur ? cur.bizId : '—'}</span>
            <span style={{ whiteSpace: 'nowrap' }}>第 {Math.min(idx + 1, tasks.length)} / {tasks.length} 题</span>
            <span style={{ whiteSpace: 'nowrap' }}>第 {cur ? cur.round : 1} 轮</span>
          </div>
        </div>
        {/* 右：操作 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <TopBtn theme={theme} onClick={prev} disabled={isFirst || done}>上一题</TopBtn>
          <TopBtn theme={theme} onClick={next} disabled={isLast || done}>下一题</TopBtn>
          <span style={{ width: 1, height: 20, background: theme.hairline }} />
          {qc ? (
            <React.Fragment>
              <TopBtn theme={theme} variant="success" onClick={pass} disabled={done}>通过</TopBtn>
              <TopBtn theme={theme} variant="danger" onClick={() => setShowReject(true)} disabled={done}>不通过</TopBtn>
            </React.Fragment>
          ) : (
            <TopBtn theme={theme} variant="primary" onClick={submitLabel} disabled={done}>提交标注</TopBtn>
          )}
        </div>
      </header>

      {/* ── 下段：iframe 区 ── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {done ? (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: SUCCESS_SOFT,
                display: 'grid', placeItems: 'center' }}>
                <Glyph name="check" size={26} color={SUCCESS} stroke={2} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: theme.font.display, fontSize: 18, fontWeight: 700, color: theme.text }}>本组已全部处理完</div>
                <div style={{ marginTop: 6, fontFamily: theme.font.body, fontSize: 13, color: theme.sub }}>
                  共处理 {tasks.length} 题，可返回任务组查看。
                </div>
              </div>
              <a href={backHref} style={{ display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 22px',
                borderRadius: theme.radius, textDecoration: 'none', background: theme.accent, color: '#fff',
                border: `1px solid ${theme.accent}`, fontFamily: theme.font.body, fontSize: 13.5, fontWeight: 600 }}>返回任务组</a>
            </div>
          </div>
        ) : (
          <IframeStub theme={theme} bizId={cur.bizId} mode={mode} />
        )}
      </div>

      {/* toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
          padding: '9px 18px', borderRadius: theme.radius + 2, background: theme.text, color: '#fff',
          fontFamily: theme.font.body, fontSize: 13, boxShadow: '0 6px 20px rgba(20,26,31,0.25)' }}>{toast}</div>
      )}

      {showReject && <RejectModal theme={theme} onCancel={() => setShowReject(false)} onConfirm={rejectConfirm} />}
    </div>
  );
}

Object.assign(window, { ExecPage });
