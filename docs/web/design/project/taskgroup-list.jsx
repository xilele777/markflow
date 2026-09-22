// taskgroup-list.jsx — 「我的任务组」列表页（当前用户作为执行人）。
// 依赖 window：Sidebar/Topbar/Btn/FilterChip/Pagination/fmt（app-shell）、Tag（tokens）。
// Exports：MyTaskGroupsPage, TG（共享元信息 + 数据）

// taskType（1-5）→ 阶段标签（分类色）+ 是否质检类
const TG_TYPE = {
  2: { label: '人工标注', bg: '#eceefb', fg: '#454fae', qc: false },
  4: { label: '人工初检', bg: '#e3eef6', fg: '#2f6a8f', qc: true },
  5: { label: '人工复检', bg: '#f2eafa', fg: '#6b46a8', qc: true },
};

// 组状态：1=待执行(灰), 2=执行中(蓝), 3=已完成(绿)
const TG_GSTATUS = {
  1: { fg: '#565b66', label: '待执行' },
  2: { fg: '#3a5ea8', label: '执行中' },
  3: { fg: '#2c7a52', label: '已完成' },
};

// 任务状态：1=待分配(灰), 2=标注中·质检中(蓝), 3=已完成(绿), 4=打回重标(红)
const TG_TSTATUS = {
  1: { fg: '#565b66', label: '待分配' },
  2: { fg: '#3a5ea8', label: '进行中' },   // 文案随组类型替换为 标注中/质检中
  3: { fg: '#2c7a52', label: '已完成' },
  4: { fg: '#a8423a', label: '打回重标' },
};

const TG_GROUPS = [
  { gid: 7012, cid: 2048, caseName: '门诊对话全流程标注', type: 2, name: '门诊对话 · 标注 A 组', tool: '对话标注器', st: 2, t: '06-04 10:22', mine: 6, todo: 18 },
  { gid: 7009, cid: 2048, caseName: '门诊对话全流程标注', type: 4, name: '门诊对话 · 初检组',    tool: '对话标注器', st: 2, t: '06-04 09:50', mine: 3, todo: 27 },
  { gid: 7004, cid: 2041, caseName: '法律问答审核流程',   type: 2, name: '法律问答 · 标注组',    tool: '文本标注器', st: 1, t: '06-03 18:30', mine: 0, todo: 40 },
  { gid: 6998, cid: 2032, caseName: '多轮对话质量复检',   type: 5, name: '多轮对话 · 复检组',    tool: '对话标注器', st: 2, t: '06-03 16:12', mine: 2, todo: 9 },
  { gid: 6990, cid: 2046, caseName: '通用指令流式标注',   type: 2, name: '通用指令 · 标注 B 组', tool: '文本标注器', st: 3, t: '06-02 11:40', mine: 0, todo: 0 },
  { gid: 6985, cid: 2035, caseName: '安全对齐双人初检',   type: 4, name: '安全对齐 · 初检组',    tool: '对话标注器', st: 3, t: '06-01 14:08', mine: 0, todo: 0 },
  { gid: 6977, cid: 2029, caseName: '金融研报抽取标注',   type: 2, name: '研报抽取 · 标注组',    tool: '文本标注器', st: 1, t: '05-31 09:15', mine: 0, todo: 22 },
  { gid: 6970, cid: 2023, caseName: '知识库问答全流程标注', type: 5, name: '知识库 · 复检组',     tool: '文本标注器', st: 2, t: '05-30 17:55', mine: 1, todo: 5 },
];

const TG_PAGES = 3;

function GStatusPill({ theme, st }) {
  const t = TG_GSTATUS[st];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: theme.font.body, fontSize: 13, color: t.fg, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.fg, flex: 'none' }} />
      {t.label}
    </span>
  );
}

function detailHref(g) {
  const q = new URLSearchParams({ gid: g.gid, name: g.name, type: g.type, caseName: g.caseName, tool: g.tool });
  return '我的任务组详情.html?' + q.toString();
}

function EmptyState({ theme, title, hint }) {
  return (
    <div style={{ padding: '64px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: theme.fill,
        display: 'grid', placeItems: 'center', border: `1px solid ${theme.hairline}` }}>
        <Glyph name="file" size={20} color={theme.weak} />
      </div>
      <div style={{ fontFamily: theme.font.body, fontSize: 14, fontWeight: 500, color: theme.sub }}>{title}</div>
      {hint && <div style={{ fontFamily: theme.font.body, fontSize: 12.5, color: theme.weak }}>{hint}</div>}
    </div>
  );
}

function MyTaskGroupsPage({ theme }) {
  const rowH = 44, cellPad = '0 16px';
  const cols = [
    { key: 'name', label: '任务组', flex: '1 1 auto', min: 240, align: 'left' },
    { key: 'tool', label: '标注工具', w: 132, align: 'left' },
    { key: 'st',   label: '状态', w: 104, align: 'left' },
    { key: 't',    label: '更新时间', w: 120, align: 'left' },
    { key: 'op',   label: '操作', w: 84, align: 'right' },
  ];
  const cell = (c) => ({ width: c.w, flex: c.flex || 'none', minWidth: c.min || (c.w ? undefined : 0),
    padding: cellPad, boxSizing: 'border-box', textAlign: c.align });

  const data = TG_GROUPS;

  return (
    <div style={{ display: 'flex', height: '100%', background: theme.canvas, fontFamily: theme.font.body, color: theme.text }}>
      <Sidebar theme={theme} active="我的任务组" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar theme={theme} crumbs={[{ label: '任务' }, { label: '我的任务组' }]} />
        <main style={{ flex: 1, overflow: 'hidden', padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* toolbar：类型筛选右对齐 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
            <FilterChip theme={theme} active>类型：全部</FilterChip>
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
              <EmptyState theme={theme} title="暂无任务组" hint="当前没有分配给你的任务组" />
            ) : data.map((g, i) => {
              const tt = TG_TYPE[g.type];
              return (
                <a key={g.gid} href={detailHref(g)} className="tg-row"
                  style={{ display: 'flex', height: rowH, alignItems: 'center', textDecoration: 'none', color: 'inherit',
                    borderBottom: i < data.length - 1 ? `1px solid ${theme.hairline}` : 'none' }}>
                  <div style={{ ...cell(cols[0]), minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Tag tone={tt} theme={{ font: theme.font, radius: theme.radius }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: theme.text,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: theme.weak,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.caseName}</span>
                    </span>
                  </div>
                  <div style={{ ...cell(cols[1]), fontSize: 13, color: theme.sub,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.tool}</div>
                  <div style={cell(cols[2])}><GStatusPill theme={theme} st={g.st} /></div>
                  <div style={cell(cols[3])}>
                    <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, color: theme.sub }}>{g.t}</span>
                  </div>
                  <div style={cell(cols[4])}>
                    <span style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.accent, fontWeight: 500 }}>进入</span>
                  </div>
                </a>
              );
            })}
          </div>

          {data.length > 0 && <Pagination theme={theme} current={1} pages={TG_PAGES} />}
        </main>
      </div>
    </div>
  );
}

const TG = { TYPE: TG_TYPE, GSTATUS: TG_GSTATUS, TSTATUS: TG_TSTATUS, GROUPS: TG_GROUPS,
  GStatusPill, EmptyState, detailHref };
Object.assign(window, { MyTaskGroupsPage, TG });
