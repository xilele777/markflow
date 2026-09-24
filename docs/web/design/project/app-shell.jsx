// app-shell.jsx — full app framework (sidebar + topbar + dataset list page),
// parameterized by { theme, density }. density: 'comfortable' | 'compact'
// Exports to window: AppShell, DATASETS

const DATASETS = [
  { did: 1042, name: '医疗对话标注集',     cat: 'annotate', tool: '对话标注器',   ver: 'v3', n: 12480, st: 'ready',   by: '张未明', id: 'DS-1042' },
  { did: 1041, name: '通用指令流式样本',   cat: 'stream',   tool: '—',           ver: 'v1', n: 86200, st: 'running', by: '李 航',  id: 'DS-1041' },
  { did: 1039, name: '图文理解结果集',     cat: 'result',   tool: '多模态标注器', ver: 'v2', n: 5360,  st: 'ready',   by: '王 芮',  id: 'DS-1039' },
  { did: 1036, name: '法律问答标注集',     cat: 'annotate', tool: '文本标注器',   ver: 'v5', n: 9140,  st: 'partial', by: '陈 思',  id: 'DS-1036' },
  { did: 1033, name: '代码评测流式集',     cat: 'stream',   tool: '—',           ver: 'v1', n: 23900, st: 'failed',  by: '赵 铭',  id: 'DS-1033' },
  { did: 1031, name: '安全对齐标注集',     cat: 'annotate', tool: '对话标注器',   ver: 'v2', n: 7720,  st: 'ready',   by: '周 岚',  id: 'DS-1031' },
  { did: 1028, name: '多轮对话结果集',     cat: 'result',   tool: '对话标注器',   ver: 'v4', n: 15030, st: 'ready',   by: '林 深',  id: 'DS-1028' },
  { did: 1025, name: '金融研报抽取标注集', cat: 'annotate', tool: '文本标注器',   ver: 'v1', n: 4210,  st: 'running', by: '何 洁',  id: 'DS-1025' },
  { did: 1022, name: '视频字幕对齐流式集', cat: 'stream',   tool: '—',           ver: 'v2', n: 31540, st: 'ready',   by: '吴 桐',  id: 'DS-1022' },
  { did: 1019, name: '知识库问答结果集',   cat: 'result',   tool: '文本标注器',   ver: 'v3', n: 8860,  st: 'partial', by: '郑 凯',  id: 'DS-1019' },
];

const TOTAL = 48; // total rows across all pages (for pagination)
const PAGES = 5;

const NAV = [
  { group: '资产', items: ['数据集'] },
  { group: '任务', items: ['标注任务', '我的任务组'] },
  { group: '系统', items: ['工作空间', '用户管理', '标注工具', 'AI 配置'] },
];

const fmt = (n) => n.toLocaleString('en-US');

function Sidebar({ theme, active = '数据集' }) {
  const s = theme.sidebar;
  const dark = theme.id === 'C';
  return (
    <aside style={{
      width: 224, flex: 'none', background: s.bg,
      borderRight: `1px solid ${s.border}`,
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* logo */}
      <div style={{ padding: '20px 20px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BrandMark theme={theme} size={22} color={dark ? (s.accentBarColor || theme.accent) : theme.accent} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontFamily: theme.font.display, fontWeight: 700, fontSize: 17,
            color: s.text, letterSpacing: theme.id === 'B' ? 0 : '-0.01em' }}>markflow</span>
          <span style={{ fontFamily: theme.font.mono, fontSize: 9.5, letterSpacing: '0.18em',
            color: s.sub, marginTop: 2 }}>MARKFLOW</span>
        </div>
      </div>

      {/* nav */}
      <nav style={{ flex: 1, padding: '6px 12px', overflow: 'hidden' }}>
        {NAV.map((g, gi) => (
          <div key={g.group} style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: theme.font.body, fontSize: 11, fontWeight: 500,
              letterSpacing: '0.04em', color: s.groupLabel, padding: '0 10px 7px' }}>{g.group}</div>
            {g.items.map((it) => {
              const isActive = it === active;
              return (
                <div key={it} style={{
                  position: 'relative',
                  display: 'flex', alignItems: 'center',
                  height: 34, padding: '0 10px', borderRadius: theme.radius,
                  marginBottom: 2,
                  background: isActive ? s.activeBg : 'transparent',
                  color: isActive ? s.activeText : s.text,
                  fontFamily: theme.font.body, fontSize: 13.5,
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                }}>
                  {isActive && s.accentBar && (
                    <span style={{ position: 'absolute', left: -12, top: 7, bottom: 7, width: 3,
                      borderRadius: 2, background: s.accentBarColor || theme.accent }} />
                  )}
                  {it}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* workspace switcher */}
      <div style={{ padding: 12, borderTop: `1px solid ${s.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 10px', borderRadius: theme.radius,
          border: `1px solid ${dark ? '#2b2f37' : theme.border}`,
          background: dark ? '#1c1f25' : theme.surface, cursor: 'pointer' }}>
          <div style={{ width: 26, height: 26, borderRadius: theme.radius - 1, flex: 'none',
            background: dark ? '#2a2e36' : theme.fill, display: 'grid', placeItems: 'center',
            fontFamily: theme.font.display, fontWeight: 700, fontSize: 13,
            color: dark ? (s.accentBarColor || theme.accent) : theme.accent }}>医</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: theme.font.body, fontSize: 12.5, fontWeight: 500,
              color: s.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>医疗智能空间</div>
            <div style={{ fontFamily: theme.font.mono, fontSize: 10, color: s.sub }}>MED-CORE</div>
          </div>
          <Glyph name="chevron" size={13} color={s.sub} />
        </div>
      </div>
    </aside>
  );
}

function Topbar({ theme, crumbs }) {
  const items = crumbs || [{ label: '资产' }, { label: '数据集' }];
  return (
    <header style={{
      height: 56, flex: 'none', background: theme.surface,
      borderBottom: `1px solid ${theme.hairline}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: theme.font.body, fontSize: 13, minWidth: 0 }}>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: theme.weak, fontSize: 11 }}>/</span>}
              {c.href && !last
                ? <a href={c.href} style={{ color: theme.weak, textDecoration: 'none' }}>{c.label}</a>
                : <span style={{ color: last ? theme.text : theme.weak, fontWeight: last ? 500 : 400,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{c.label}</span>}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontFamily: theme.font.mono, fontSize: 11.5, color: theme.weak }}>v0.9.2</span>
        <a href="登录.html" title="退出登录" style={{ display: 'inline-flex' }}>
          <Avatar initials="张" theme={theme} size={30} />
        </a>
      </div>
    </header>
  );
}

function Btn({ theme, kind = 'ghost', children, icon, href, onClick }) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 7,
    height: 34, padding: '0 14px', borderRadius: theme.radius,
    fontFamily: theme.font.body, fontSize: 13, fontWeight: 500, cursor: 'pointer',
    whiteSpace: 'nowrap', border: '1px solid transparent', textDecoration: 'none', boxSizing: 'border-box' };
  let st = {};
  if (kind === 'primary') {
    if (theme.primaryBtn === 'outline') st = { background: theme.surface, color: theme.text,
      border: `1px solid ${theme.text}` };
    else st = { background: theme.accent, color: '#fff', border: `1px solid ${theme.accent}` };
  } else if (kind === 'ghost') {
    st = { background: theme.surface, color: theme.sub, border: `1px solid ${theme.border}` };
  }
  const inner = <React.Fragment>{icon && <Glyph name={icon} size={14} color={st.color} />}{children}</React.Fragment>;
  if (href) return <a href={href} onClick={onClick} style={{ ...base, ...st }}>{inner}</a>;
  return <button onClick={onClick} style={{ ...base, ...st }}>{inner}</button>;
}

function Field({ theme, placeholder, icon, w }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, width: w,
      padding: '0 11px', borderRadius: theme.radius,
      background: theme.surface, border: `1px solid ${theme.border}` }}>
      {icon && <Glyph name={icon} size={14} color={theme.weak} />}
      <span style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.weak }}>{placeholder}</span>
    </div>
  );
}

function FilterChip({ theme, children, active }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34,
      padding: '0 12px', borderRadius: theme.radius, cursor: 'pointer',
      background: active ? theme.accentSoft : theme.surface,
      border: `1px solid ${active ? 'transparent' : theme.border}`,
      color: active ? theme.accent : theme.sub,
      fontFamily: theme.font.body, fontSize: 13, fontWeight: active ? 600 : 400 }}>
      {children}
      <Glyph name="chevron" size={12} color={active ? theme.accent : theme.weak} />
    </div>
  );
}

function Pagination({ theme, current = 1, pages = 5 }) {
  const box = (content, { active, disabled, key } = {}) => (
    <div key={key} style={{
      minWidth: 30, height: 30, padding: '0 8px', borderRadius: theme.radius,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: theme.font.body, fontSize: 13,
      cursor: disabled ? 'default' : 'pointer',
      background: active ? theme.accent : theme.surface,
      color: active ? '#fff' : (disabled ? theme.weak : theme.sub),
      border: `1px solid ${active ? theme.accent : theme.border}`,
      fontWeight: active ? 600 : 400, boxSizing: 'border-box',
    }}>{content}</div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
      {box(<span style={{ display: 'inline-block', transform: 'rotate(90deg)' }}><Glyph name="chevron" size={13} color={theme.weak} /></span>, { disabled: current === 1, key: 'prev' })}
      {Array.from({ length: pages }, (_, i) => i + 1).map((p) =>
        box(p, { active: p === current, key: 'p' + p }))}
      {box(<span style={{ display: 'inline-block', transform: 'rotate(-90deg)' }}><Glyph name="chevron" size={13} color={theme.sub} /></span>, { key: 'next' })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 10,
        fontFamily: theme.font.body, fontSize: 13, color: theme.sub }}>
        跳至
        <div style={{ width: 46, height: 30, borderRadius: theme.radius, border: `1px solid ${theme.border}`,
          background: theme.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: theme.font.mono, fontSize: 13, color: theme.text }}>{current}</div>
        页
      </div>
    </div>
  );
}

function AppShell({ theme, density = 'comfortable' }) {
  const compact = density === 'compact';
  const rowH = compact ? 44 : 56;
  const cellPad = '0 16px';
  const nameSize = compact ? 13.5 : 14;
  const headSize = compact ? 11.5 : 12;

  // name flexes; everything else fixed so the row always fits
  const cols = [
    { key: 'did',  label: 'ID', w: 72, align: 'left' },
    { key: 'name', label: '名称', flex: '1 1 auto', min: 180, align: 'left' },
    { key: 'id',   label: '编号', w: 104, align: 'left' },
    { key: 'cat',  label: '类型', w: 84, align: 'left' },
    { key: 'tool', label: '标注工具', w: 132, align: 'left' },
    { key: 'ver',  label: '最新版本', w: 92, align: 'left' },
    { key: 'n',    label: '样本数', w: 104, align: 'right' },
    { key: 'st',   label: '状态', w: 116, align: 'left' },
    { key: 'by',   label: '创建人', w: 96, align: 'left' },
    { key: 'op',   label: '操作', w: 96, align: 'right' },
  ];
  const cell = (c) => ({
    width: c.w, flex: c.flex || 'none', minWidth: c.min || (c.w ? undefined : 0),
    padding: cellPad, boxSizing: 'border-box', textAlign: c.align,
  });

  return (
    <div style={{ display: 'flex', height: '100%', background: theme.canvas,
      fontFamily: theme.font.body, color: theme.text }}>
      <Sidebar theme={theme} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar theme={theme} />
        <main style={{ flex: 1, overflow: 'hidden', padding: '22px 28px',
          display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* toolbar — search + filters + primary action, all right-aligned on one row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
            <Field theme={theme} placeholder="搜索名称 / 创建人" icon="search" w={240} />
            <FilterChip theme={theme} active>类型：标注</FilterChip>
            <FilterChip theme={theme}>状态：全部</FilterChip>
            <Btn theme={theme} kind="primary" icon="plus" href="新建数据集.html">新建数据集</Btn>
          </div>

          {/* table */}
          <div style={{ background: theme.surface, border: `1px solid ${theme.hairline}`,
            borderRadius: theme.radius + 1, overflow: 'hidden' }}>
            {/* head */}
            <div style={{ display: 'flex', height: compact ? 40 : 44, alignItems: 'center',
              borderBottom: `1px solid ${theme.hairline}`, background: theme.fill }}>
              {cols.map((c) => (
                <div key={c.key} style={{ ...cell(c),
                  fontFamily: theme.font.body, fontSize: headSize, fontWeight: 500,
                  letterSpacing: '0.02em', color: theme.weak }}>{c.label}</div>
              ))}
            </div>
            {/* rows */}
            {DATASETS.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', height: rowH, alignItems: 'center',
                borderBottom: i < DATASETS.length - 1 ? `1px solid ${theme.hairline}` : 'none' }}>
                <div style={cell(cols[0])}>
                  <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, color: theme.sub }}>{d.did}</span>
                </div>
                <div style={{ ...cell(cols[1]), minWidth: 0 }}>
                  <div style={{ fontSize: nameSize, fontWeight: 500, color: theme.text,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                </div>
                <div style={cell(cols[2])}>
                  <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, color: theme.sub }}>{d.id}</span>
                </div>
                <div style={cell(cols[3])}>
                  <Tag tone={CATEGORY[d.cat]} theme={{ font: theme.font, radius: theme.radius }} />
                </div>
                <div style={{ ...cell(cols[4]), fontSize: 13, color: d.tool === '—' ? theme.weak : theme.sub,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.tool}</div>
                <div style={cell(cols[5])}>
                  <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, color: theme.sub }}>{d.ver}</span>
                </div>
                <div style={cell(cols[6])}>
                  <span style={{ fontFamily: theme.font.mono, fontSize: 13, color: theme.text }}>{fmt(d.n)}</span>
                </div>
                <div style={cell(cols[7])}>
                  <StatusPill tone={STATUS[d.st]} theme={theme} />
                </div>
                <div style={{ ...cell(cols[8]), fontSize: 13, color: theme.sub }}>{d.by}</div>
                <div style={cell(cols[9])}>
                  <a href="数据集详情.html" style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.accent,
                    fontWeight: 500, textDecoration: 'none' }}>查看详情</a>
                </div>
              </div>
            ))}
          </div>

          {/* pagination */}
          <Pagination theme={theme} current={1} pages={PAGES} />
        </main>
      </div>
    </div>
  );
}

Object.assign(window, { AppShell, DATASETS, Sidebar, Topbar, Btn, Field, FilterChip, Pagination, fmt });
