// create-case.jsx — 新建标注任务（创建 Case）全宽表单页。
// 依赖 window：Sidebar/Topbar/Btn/Glyph（app-shell）、STATUS（tokens）、CC（create-case-atoms）。
// Exports：CreateCasePage

function KindTag({ theme, kind, dim }) {
  const ai = kind === 'ai';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: theme.font.mono,
      fontSize: 11, fontWeight: 500, lineHeight: 1, padding: '3px 6px', borderRadius: theme.radius - 2,
      background: dim ? theme.fill : (ai ? theme.accentSoft : theme.fill),
      color: dim ? theme.weak : (ai ? theme.accent : theme.sub) }}>{ai ? 'AI' : '人工'}</span>
  );
}

// ── 区块二：流程编排步骤卡 ──
function StageStep({ theme, stage, on, onToggle, isLast }) {
  return (
    <React.Fragment>
      <button onClick={onToggle} style={{ flex: '1 1 0', minWidth: 0, textAlign: 'left', cursor: 'pointer',
        border: `1px solid ${on ? theme.accent : theme.border}`,
        background: on ? theme.surface : theme.fill, borderRadius: theme.radius + 1,
        padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 11,
        boxShadow: on ? `0 1px 2px ${theme.accentSoft}` : 'none', transition: 'all .15s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 18, height: 18, borderRadius: 5, flex: 'none', display: 'grid', placeItems: 'center',
            boxSizing: 'border-box', background: on ? theme.accent : theme.surface,
            border: `1.5px solid ${on ? theme.accent : theme.border}` }}>
            {on && <Glyph name="check" size={11} color="#fff" stroke={2.2} />}
          </span>
          <span style={{ fontFamily: theme.font.mono, fontSize: 11.5, color: on ? theme.sub : theme.weak }}>{stage.code}</span>
          <span style={{ marginLeft: 'auto' }}><KindTag theme={theme} kind={stage.kind} dim={!on} /></span>
        </div>
        <span style={{ fontFamily: theme.font.display, fontSize: 14, fontWeight: 600,
          color: on ? theme.text : theme.weak }}>{stage.label}</span>
      </button>
      {!isLast && (
        <div style={{ flex: 'none', display: 'grid', placeItems: 'center', color: theme.weak, width: 18 }}>
          <Glyph name="arrow" size={15} color={theme.border} />
        </div>
      )}
    </React.Fragment>
  );
}

// ── 区块三：成员行 ──
function MemberRow({ theme, m, idx, fixed, usedNames, onChange, onRemove, canRemove }) {
  const opts = CC.MEMBERS.filter((n) => n === m.username || !usedNames.includes(n)).map((n) => ({ code: n, name: n }));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <CC.Select theme={theme} value={m.username} options={opts} placeholder="选择成员"
          onChange={(v) => onChange({ ...m, username: v })} />
      </div>
      <div style={{ width: 64, flex: 'none', display: 'grid', placeItems: 'center' }}>
        <CC.Switch theme={theme} on={m.active} onClick={() => onChange({ ...m, active: !m.active })} />
      </div>
      {fixed && (
        <div style={{ width: 96, flex: 'none' }}>
          <CC.Num theme={theme} value={m.ratio} min={0} suffix="%" w={96}
            onChange={(v) => onChange({ ...m, ratio: v })} />
        </div>
      )}
      <button onClick={canRemove ? onRemove : undefined} title="移除" style={{ width: 36, height: 36, flex: 'none',
        borderRadius: theme.radius, border: `1px solid ${theme.border}`, background: theme.surface,
        color: theme.weak, cursor: canRemove ? 'pointer' : 'not-allowed', opacity: canRemove ? 1 : 0.4,
        display: 'grid', placeItems: 'center' }}>
        <Glyph name="x" size={13} color={theme.weak} />
      </button>
    </div>
  );
}

function colHead(theme, text, w, center) {
  return <div style={{ width: w, flex: w ? 'none' : '1', fontFamily: theme.font.body, fontSize: 12,
    color: theme.weak, textAlign: center ? 'center' : 'left' }}>{text}</div>;
}

function ConfigCard({ theme, stage, cfg, set, tool }) {
  const ai = stage.kind === 'ai';
  const aiOpts = CC.AICFG.filter((c) => c.tool === tool);
  const fixed = cfg.strategy === 2;
  const activeMembers = ai ? [] : cfg.members.filter((m) => m.active && m.username);
  const ratioSum = activeMembers.reduce((s, m) => s + (Number(m.ratio) || 0), 0);
  const usedNames = ai ? [] : cfg.members.map((m) => m.username).filter(Boolean);

  const updateMember = (i, nm) => set({ members: cfg.members.map((m, j) => (j === i ? nm : m)) });
  const addMember = () => set({ members: [...cfg.members, { username: '', active: true, ratio: '' }] });
  const removeMember = (i) => set({ members: cfg.members.filter((_, j) => j !== i) });

  return (
    <div style={{ border: `1px solid ${theme.hairline}`, borderRadius: theme.radius + 1, overflow: 'hidden' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 16px',
        background: theme.fill, borderBottom: `1px solid ${theme.hairline}` }}>
        <span style={{ width: 22, height: 22, borderRadius: theme.radius - 1, flex: 'none', display: 'grid',
          placeItems: 'center', background: theme.surface, border: `1px solid ${theme.border}`,
          fontFamily: theme.font.mono, fontSize: 12, color: theme.sub }}>{stage.code}</span>
        <span style={{ fontFamily: theme.font.display, fontSize: 14, fontWeight: 600, color: theme.text }}>{stage.label}</span>
        <KindTag theme={theme} kind={stage.kind} />
      </div>

      <div style={{ padding: '16px 16px 18px' }}>
        {ai ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 14, alignItems: 'end' }}>
            <div>
              <CC.Lbl theme={theme} required>AI 配置</CC.Lbl>
              <CC.Select theme={theme} value={cfg.aiCode} options={aiOpts.map((o) => ({ code: o.code, name: o.name }))}
                disabled={!tool} placeholder={tool ? '选择 AI 配置' : '请先选择标注工具'}
                onChange={(v) => set({ aiCode: v })} />
            </div>
            <div>
              <CC.Lbl theme={theme}>预派条数</CC.Lbl>
              <CC.Num theme={theme} value={cfg.preDispatchSize} min={1} w="100%"
                onChange={(v) => set({ preDispatchSize: v })} />
            </div>
            <div>
              <CC.Lbl theme={theme}>超时回收</CC.Lbl>
              <CC.Num theme={theme} value={cfg.autoRecycleMinutes} min={1} suffix="分钟" w="100%"
                onChange={(v) => set({ autoRecycleMinutes: v })} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px 28px', alignItems: 'flex-end' }}>
              <div>
                <CC.Lbl theme={theme}>派发策略</CC.Lbl>
                <CC.Segmented theme={theme} value={cfg.strategy}
                  options={[{ code: 1, name: '先到先得' }, { code: 2, name: '固定分配' }]}
                  onChange={(v) => set({ strategy: v })} />
              </div>
              <div>
                <CC.Lbl theme={theme}>预派条数</CC.Lbl>
                <CC.Num theme={theme} value={cfg.preDispatchSize} min={1} w={120}
                  onChange={(v) => set({ preDispatchSize: v })} />
              </div>
              <div>
                <CC.Lbl theme={theme}>超时回收</CC.Lbl>
                <CC.Num theme={theme} value={cfg.autoRecycleMinutes} min={1} suffix="分钟" w={130}
                  onChange={(v) => set({ autoRecycleMinutes: v })} />
              </div>
            </div>

            {/* 成员表 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0 9px' }}>
                {colHead(theme, '成员', 0)}
                {colHead(theme, '启用', 64, true)}
                {fixed && colHead(theme, '比例', 96, false)}
                <div style={{ width: 36, flex: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {cfg.members.map((m, i) => (
                  <MemberRow key={i} theme={theme} m={m} idx={i} fixed={fixed} usedNames={usedNames}
                    onChange={(nm) => updateMember(i, nm)} onRemove={() => removeMember(i)}
                    canRemove={cfg.members.length > 1} />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <button onClick={addMember} style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 12px', borderRadius: theme.radius, cursor: 'pointer',
                  background: theme.surface, border: `1px dashed ${theme.border}`, color: theme.sub,
                  fontFamily: theme.font.body, fontSize: 13 }}>
                  <Glyph name="plus" size={13} color={theme.sub} />添加成员
                </button>
                {fixed && (
                  <span style={{ fontFamily: theme.font.body, fontSize: 12.5,
                    color: ratioSum === 100 ? STATUS.ready.fg : STATUS.failed.fg }}>
                    启用成员比例合计 <span style={{ fontFamily: theme.font.mono }}>{ratioSum}%</span> / 100%
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateCasePage({ theme }) {
  const [name, setName] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [tool, setTool] = React.useState('');
  const [srcType, setSrcType] = React.useState(1); // 1 数据集 / 2 流式
  const [dsId, setDsId] = React.useState('');
  const [verId, setVerId] = React.useState('');
  const [enabled, setEnabled] = React.useState({ aiPreLabel: true, label: true, aiPreReview: false, review: false, recheck: false });
  const [cfg, setCfg] = React.useState({
    aiPreLabel:  { aiCode: '', preDispatchSize: 50, autoRecycleMinutes: 30 },
    aiPreReview: { aiCode: '', preDispatchSize: 50, autoRecycleMinutes: 20 },
    label:   { strategy: 1, preDispatchSize: 3, autoRecycleMinutes: 30, members: [{ username: '', active: true, ratio: '' }] },
    review:  { strategy: 1, preDispatchSize: 3, autoRecycleMinutes: 30, members: [{ username: '', active: true, ratio: '' }] },
    recheck: { strategy: 1, preDispatchSize: 3, autoRecycleMinutes: 30, members: [{ username: '', active: true, ratio: '' }] },
  });

  React.useEffect(() => {
    const id = 'ls-field-style';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = `.ls-field:focus{border-color:${theme.accent}!important;box-shadow:0 0 0 3px ${theme.accentSoft}}`;
      document.head.appendChild(s);
    }
  }, []);

  const patchCfg = (type, patch) => setCfg((c) => ({ ...c, [type]: { ...c[type], ...patch } }));
  const toggleStage = (type) => setEnabled((e) => ({ ...e, [type]: !e[type] }));
  const onToolChange = (v) => {
    setTool(v);
    // AI 配置随工具联动：清空已选、不匹配的 AI 配置
    setCfg((c) => ({ ...c, aiPreLabel: { ...c.aiPreLabel, aiCode: '' }, aiPreReview: { ...c.aiPreReview, aiCode: '' } }));
  };
  const onDsChange = (v) => { setDsId(v); setVerId(''); };

  const ds = CC.DATASETS.find((d) => d.code === dsId);
  const verOpts = ds ? ds.versions.filter((x) => x.ready).map((x) => ({ code: String(x.id), name: `${x.v} · 已就绪` })) : [];

  // 校验
  const dsOk = srcType === 2 || (dsId && verId);
  const stageConstraint = enabled.aiPreLabel || enabled.label;
  const enabledStages = CC.STAGES.filter((s) => enabled[s.type]);
  const stagesOk = enabledStages.every((s) => {
    const c = cfg[s.type];
    if (s.kind === 'ai') return !!c.aiCode;
    const active = c.members.filter((m) => m.active && m.username);
    if (active.length === 0) return false;
    if (c.strategy === 2) return active.reduce((a, m) => a + (Number(m.ratio) || 0), 0) === 100;
    return true;
  });
  const valid = !!(name.trim() && tool && dsOk && stageConstraint && stagesOk);

  return (
    <div style={{ display: 'flex', height: '100%', background: theme.canvas, fontFamily: theme.font.body, color: theme.text }}>
      <Sidebar theme={theme} active="标注任务" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar theme={theme} crumbs={[{ label: '任务' }, { label: '标注任务', href: '标注任务列表.html' }, { label: '新建标注任务' }]} />

        <main style={{ flex: 1, overflow: 'auto', padding: '22px 28px' }}>
          <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 页头：返回 + 标题 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <a href="标注任务列表.html" style={{ width: 34, height: 34, flex: 'none', borderRadius: theme.radius,
                border: `1px solid ${theme.border}`, background: theme.surface, display: 'grid', placeItems: 'center' }}>
                <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>
                  <Glyph name="arrow" size={15} color={theme.sub} />
                </span>
              </a>
              <h1 style={{ margin: 0, fontFamily: theme.font.display, fontSize: 21, fontWeight: 700, color: theme.text }}>新建标注任务</h1>
            </div>

            {/* 区块一：基本信息 */}
            <CC.Card theme={theme} title="基本信息" step="01">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  <div><CC.Lbl theme={theme} required>任务名</CC.Lbl>
                    <CC.Text theme={theme} value={name} onChange={setName} placeholder="如：门诊对话全流程标注" /></div>
                  <div><CC.Lbl theme={theme} required>标注工具</CC.Lbl>
                    <CC.Select theme={theme} value={tool} onChange={onToolChange} options={CC.TOOLS} placeholder="选择标注工具" /></div>
                </div>
                <div><CC.Lbl theme={theme} hint="选填">描述</CC.Lbl>
                  <CC.Area theme={theme} value={desc} onChange={setDesc} placeholder="任务目标、场景与说明" /></div>
                <div>
                  <CC.Lbl theme={theme} required>数据源</CC.Lbl>
                  <CC.Segmented theme={theme} value={srcType} onChange={setSrcType}
                    options={[{ code: 1, name: '数据集模式' }, { code: 2, name: '流式标注' }]} />
                </div>
                {srcType === 1 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    <div><CC.Lbl theme={theme} required>数据集</CC.Lbl>
                      <CC.Select theme={theme} value={dsId} onChange={onDsChange}
                        options={CC.DATASETS.map((d) => ({ code: d.code, name: d.name }))} placeholder="选择数据集" /></div>
                    <div><CC.Lbl theme={theme} required hint={ds ? undefined : '先选数据集'}>数据集版本</CC.Lbl>
                      <CC.Select theme={theme} value={verId} onChange={setVerId} options={verOpts}
                        disabled={!ds} placeholder={ds ? '选择已就绪的版本' : '请先选择数据集'} /></div>
                  </div>
                )}
              </div>
            </CC.Card>

            {/* 区块二：流程编排 */}
            <CC.Card theme={theme} title="流程编排" step="02"
              desc="勾选启用的阶段，顺序固定不可调；AI 预标与人工标注至少启用一个">
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
                {CC.STAGES.map((s, i) => (
                  <StageStep key={s.type} theme={theme} stage={s} on={enabled[s.type]}
                    onToggle={() => toggleStage(s.type)} isLast={i === CC.STAGES.length - 1} />
                ))}
              </div>
              {!stageConstraint && (
                <div style={{ marginTop: 12, fontFamily: theme.font.body, fontSize: 12.5, color: STATUS.failed.fg }}>
                  「AI 预标」与「人工标注」至少需启用一个。
                </div>
              )}
            </CC.Card>

            {/* 区块三：人员 / AI 分配 */}
            <CC.Card theme={theme} title="人员 / AI 分配" step="03"
              desc="仅对已启用的阶段逐个配置">
              {enabledStages.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', fontFamily: theme.font.body,
                  fontSize: 13, color: theme.weak }}>请先在流程编排中启用至少一个阶段</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {enabledStages.map((s) => (
                    <ConfigCard key={s.type} theme={theme} stage={s} cfg={cfg[s.type]} tool={tool}
                      set={(patch) => patchCfg(s.type, patch)} />
                  ))}
                </div>
              )}
            </CC.Card>

            <div style={{ height: 8 }} />
          </div>
        </main>

        {/* 底部操作栏 */}
        <footer style={{ flex: 'none', height: 64, borderTop: `1px solid ${theme.hairline}`, background: theme.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '0 28px' }}>
          <Btn theme={theme} kind="ghost" href="标注任务列表.html">取消</Btn>
          <a href={valid ? '标注任务列表.html' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 22px',
              borderRadius: theme.radius, fontFamily: theme.font.body, fontSize: 13.5, fontWeight: 600,
              textDecoration: 'none', boxSizing: 'border-box',
              background: valid ? theme.accent : theme.fill, color: valid ? '#fff' : theme.weak,
              border: `1px solid ${valid ? theme.accent : theme.border}`,
              cursor: valid ? 'pointer' : 'not-allowed', pointerEvents: valid ? 'auto' : 'none' }}>
            创建任务
          </a>
        </footer>
      </div>
    </div>
  );
}

Object.assign(window, { CreateCasePage });
