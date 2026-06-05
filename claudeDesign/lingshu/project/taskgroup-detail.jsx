// taskgroup-detail.jsx — 「我的任务组」详情页（二级页，组内任务列表）。
// 依赖 window：Sidebar/Topbar/Btn/FilterChip/Pagination（app-shell）、Tag（tokens）、TG（taskgroup-list）。
// Exports：TaskGroupDetailPage

// 组内任务 mock（taskGroupSeq / bizId / status / round / claimTime）
const TGD_TASKS = [
  { tid: 90412, seq: 1,  bizId: 'OPD-20260604-0008', st: 2, round: 1, claim: '06-04 10:24' },
  { tid: 90408, seq: 2,  bizId: 'OPD-20260604-0007', st: 2, round: 1, claim: '06-04 10:24' },
  { tid: 90401, seq: 3,  bizId: 'OPD-20260604-0006', st: 4, round: 2, claim: '06-04 09:58' },
  { tid: 90397, seq: 4,  bizId: 'OPD-20260604-0005', st: 3, round: 1, claim: '06-03 17:40' },
  { tid: 90390, seq: 5,  bizId: 'OPD-20260604-0004', st: 3, round: 1, claim: '06-03 17:39' },
  { tid: 90384, seq: 6,  bizId: 'OPD-20260603-0021', st: 1, round: 1, claim: '—' },
  { tid: 90377, seq: 7,  bizId: 'OPD-20260603-0020', st: 1, round: 1, claim: '—' },
  { tid: 90369, seq: 8,  bizId: 'OPD-20260603-0019', st: 1, round: 1, claim: '—' },
];

const TGD_PAGES = 4;

function tStatusLabel(st, qc) {
  if (st === 2) return qc ? '质检中' : '标注中';
  return TG.TSTATUS[st].label;
}

function TaskGroupDetailPage({ theme }) {
  const params = new URLSearchParams(location.search);
  const g = {
    name: params.get('name') || '门诊对话 · 标注 A 组',
    type: Number(params.get('type')) || 2,
    caseName: params.get('caseName') || '门诊对话全流程标注',
    tool: params.get('tool') || '对话标注器',
  };
  const tt = TG.TYPE[g.type] || TG.TYPE[2];
  const qc = tt.qc;
  const enterLabel = qc ? '进入质检' : '进入标注';
  const execHref = (qc ? '质检执行页.html' : '标注执行页.html') + (location.search || '');

  const data = TGD_TASKS;
  const mine = data.filter((t) => t.st === 2 || t.st === 4).length;
  const todo = data.filter((t) => t.st === 1).length;

  const rowH = 44, cellPad = '0 16px';
  const cols = [
    { key: 'seq',   label: '序号', w: 70, align: 'left' },
    { key: 'bizId', label: '业务 ID', flex: '1 1 auto', min: 220, align: 'left' },
    { key: 'st',    label: '状态', w: 116, align: 'left' },
    { key: 'round', label: '轮次', w: 84, align: 'left' },
    { key: 'claim', label: '领取时间', w: 130, align: 'left' },
    { key: 'op',    label: '操作', w: 116, align: 'right' },
  ];
  const cell = (c) => ({ width: c.w, flex: c.flex || 'none', minWidth: c.min || (c.w ? undefined : 0),
    padding: cellPad, boxSizing: 'border-box', textAlign: c.align });

  return (
    <div style={{ display: 'flex', height: '100%', background: theme.canvas, fontFamily: theme.font.body, color: theme.text }}>
      <Sidebar theme={theme} active="我的任务组" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar theme={theme} crumbs={[{ label: '任务' }, { label: '我的任务组', href: '我的任务组.html' }, { label: g.name }]} />
        <main style={{ flex: 1, overflow: 'auto', padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 标题区：返回 + 组信息 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href="我的任务组.html" style={{ width: 34, height: 34, flex: 'none', borderRadius: theme.radius,
              border: `1px solid ${theme.border}`, background: theme.surface, display: 'grid', placeItems: 'center' }}>
              <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>
                <Glyph name="arrow" size={15} color={theme.sub} />
              </span>
            </a>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ margin: 0, fontFamily: theme.font.display, fontSize: 20, fontWeight: 700, color: theme.text,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</h1>
                <Tag tone={tt} theme={{ font: theme.font, radius: theme.radius }} />
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10,
                fontFamily: theme.font.body, fontSize: 12.5, color: theme.sub }}>
                <span>所属任务 · {g.caseName}</span>
                <span style={{ color: theme.weak }}>·</span>
                <span style={{ color: theme.weak }}>{g.tool}</span>
              </div>
            </div>
          </div>

          {/* toolbar：状态筛选 + 工作量汇总 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <FilterChip theme={theme} active>状态：全部</FilterChip>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: theme.font.body, fontSize: 13 }}>
              <span style={{ color: theme.sub }}>在手 <span style={{ fontFamily: theme.font.mono, color: theme.accent, fontWeight: 600 }}>{mine}</span></span>
              <span style={{ color: theme.sub }}>待办 <span style={{ fontFamily: theme.font.mono, color: theme.text, fontWeight: 600 }}>{todo}</span></span>
            </div>
          </div>

          {/* table */}
          <div style={{ background: theme.surface, border: `1px solid ${theme.hairline}`,
            borderRadius: theme.radius + 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', height: 40, alignItems: 'center',
              borderBottom: `1px solid ${theme.hairline}`, background: theme.fill }}>
              {cols.map((c) => (
                <div key={c.key} style={{ ...cell(c), fontFamily: theme.font.body, fontSize: 11.5,
                  fontWeight: 500, letterSpacing: '0.02em', color: theme.weak }}>{c.label}</div>
              ))}
            </div>

            {data.length === 0 ? (
              <TG.EmptyState theme={theme} title="该任务组暂无任务" hint="待分配后任务会出现在这里" />
            ) : data.map((t, i) => {
              const tone = TG.TSTATUS[t.st];
              const canEnter = t.st === 1 || t.st === 2 || t.st === 4;
              return (
                <div key={t.tid} style={{ display: 'flex', height: rowH, alignItems: 'center',
                  borderBottom: i < data.length - 1 ? `1px solid ${theme.hairline}` : 'none' }}>
                  <div style={cell(cols[0])}>
                    <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, color: theme.weak }}>#{t.seq}</span>
                  </div>
                  <div style={{ ...cell(cols[1]), minWidth: 0 }}>
                    <span style={{ fontFamily: theme.font.mono, fontSize: 13, color: theme.text,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.bizId}</span>
                  </div>
                  <div style={cell(cols[2])}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontFamily: theme.font.body, fontSize: 13, color: tone.fg, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone.fg, flex: 'none' }} />
                      {tStatusLabel(t.st, qc)}
                    </span>
                  </div>
                  <div style={cell(cols[3])}>
                    <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, whiteSpace: 'nowrap',
                      color: t.round > 1 ? TG.TSTATUS[4].fg : theme.sub }}>第 {t.round} 轮</span>
                  </div>
                  <div style={cell(cols[4])}>
                    <span style={{ fontFamily: theme.font.mono, fontSize: 12.5,
                      color: t.claim === '—' ? theme.weak : theme.sub }}>{t.claim}</span>
                  </div>
                  <div style={cell(cols[5])}>
                    {t.st === 3 ? (
                      <span style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.weak }}>已完成</span>
                    ) : (
                      <a href={execHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30,
                        padding: '0 12px', borderRadius: theme.radius, textDecoration: 'none', boxSizing: 'border-box',
                        background: theme.accent, color: '#fff', fontFamily: theme.font.body, fontSize: 12.5, fontWeight: 500 }}>
                        {t.st === 4 ? '重新' + (qc ? '质检' : '标注') : enterLabel}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {data.length > 0 && <Pagination theme={theme} current={1} pages={TGD_PAGES} />}
        </main>
      </div>
    </div>
  );
}

Object.assign(window, { TaskGroupDetailPage });
