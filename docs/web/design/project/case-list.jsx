// case-list.jsx — 标注任务（Case）列表页。复用 app-shell.jsx 导出的共享原子
// （Sidebar / Topbar / Btn / Field / FilterChip / Pagination / fmt）。
// Exports to window: CaseListShell, CASES

// 数据来源：1=数据集, 2=流式
const CASE_SOURCE = {
  1: { bg: '#eceefb', fg: '#454fae', label: '数据集' },
  2: { bg: '#e2f1ee', fg: '#277268', label: '流式' },
};

// case 状态：1=未启动, 2=运行中, 3=已暂停, 4=已结束
const CASE_STATUS = {
  1: { fg: '#9aa0ab', label: '未启动' },
  2: { fg: '#3a5ea8', label: '运行中' },
  3: { fg: '#8a6312', label: '已暂停' },
  4: { fg: '#2c7a52', label: '已结束' },
};

const CASES = [
  { cid: 2048, caseId: 'CASE-2048', name: '门诊对话三段式标注',     src: 1, tool: '对话标注器',   status: 2, creator: '张未明', t: '2026-05-30' },
  { cid: 2046, caseId: 'CASE-2046', name: '通用指令流式标注',       src: 2, tool: '文本标注器',   status: 2, creator: '李 航',  t: '2026-05-29' },
  { cid: 2043, caseId: 'CASE-2043', name: '影像报告多模态复检',     src: 1, tool: '多模态标注器', status: 3, creator: '王 芮',  t: '2026-05-27' },
  { cid: 2041, caseId: 'CASE-2041', name: '法律问答审核流程',       src: 1, tool: '文本标注器',   status: 2, creator: '陈 思',  t: '2026-05-26' },
  { cid: 2038, caseId: 'CASE-2038', name: '代码评测流式预标注',     src: 2, tool: '对话标注器',   status: 1, creator: '赵 铭',  t: '2026-05-24' },
  { cid: 2035, caseId: 'CASE-2035', name: '安全对齐双人初检',       src: 1, tool: '对话标注器',   status: 4, creator: '周 岚',  t: '2026-05-22' },
  { cid: 2032, caseId: 'CASE-2032', name: '多轮对话质量复检',       src: 1, tool: '对话标注器',   status: 2, creator: '林 深',  t: '2026-05-20' },
  { cid: 2029, caseId: 'CASE-2029', name: '金融研报抽取标注',       src: 1, tool: '文本标注器',   status: 3, creator: '何 洁',  t: '2026-05-18' },
  { cid: 2026, caseId: 'CASE-2026', name: '视频字幕对齐流式',       src: 2, tool: '多模态标注器', status: 4, creator: '吴 桐',  t: '2026-05-15' },
  { cid: 2023, caseId: 'CASE-2023', name: '知识库问答全流程标注',   src: 1, tool: '文本标注器',   status: 1, creator: '郑 凯',  t: '2026-05-13' },
];

const CASE_PAGES = 4;

function CaseStatusPill({ theme, status }) {
  const tone = CASE_STATUS[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: theme.font.body, fontSize: 13, color: tone.fg, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone.fg, flex: 'none' }} />
      {tone.label}
    </span>
  );
}

function CaseListShell({ theme, density = 'compact' }) {
  const compact = density === 'compact';
  const rowH = compact ? 44 : 56;
  const cellPad = '0 16px';
  const nameSize = compact ? 13.5 : 14;
  const headSize = compact ? 11.5 : 12;

  const cols = [
    { key: 'cid',    label: 'ID',      w: 72,  align: 'left' },
    { key: 'name',   label: '任务名',  flex: '1 1 auto', min: 200, align: 'left' },
    { key: 'id',     label: '编号',    w: 116, align: 'left' },
    { key: 'src',    label: '数据来源', w: 96,  align: 'left' },
    { key: 'tool',   label: '标注工具', w: 132, align: 'left' },
    { key: 'status', label: '状态',    w: 104, align: 'left' },
    { key: 'creator',label: '创建人',  w: 96,  align: 'left' },
    { key: 'time',   label: '创建时间', w: 124, align: 'left' },
    { key: 'op',     label: '操作',    w: 96,  align: 'right' },
  ];
  const cell = (c) => ({
    width: c.w, flex: c.flex || 'none', minWidth: c.min || (c.w ? undefined : 0),
    padding: cellPad, boxSizing: 'border-box', textAlign: c.align,
  });

  return (
    <div style={{ display: 'flex', height: '100%', background: theme.canvas,
      fontFamily: theme.font.body, color: theme.text }}>
      <Sidebar theme={theme} active="标注任务" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar theme={theme} crumbs={[{ label: '任务' }, { label: '标注任务' }]} />
        <main style={{ flex: 1, overflow: 'hidden', padding: '22px 28px',
          display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* toolbar — 搜索 + 筛选 + 主操作，统一右对齐 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
            <Field theme={theme} placeholder="搜索任务名" icon="search" w={220} />
            <FilterChip theme={theme}>数据来源：全部</FilterChip>
            <FilterChip theme={theme} active>状态：运行中</FilterChip>
            <Btn theme={theme} kind="primary" icon="plus" href="新建标注任务.html">新建任务</Btn>
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
            {CASES.map((d, i) => (
              <div key={d.caseId} style={{ display: 'flex', height: rowH, alignItems: 'center',
                borderBottom: i < CASES.length - 1 ? `1px solid ${theme.hairline}` : 'none' }}>
                <div style={cell(cols[0])}>
                  <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, color: theme.sub }}>{d.cid}</span>
                </div>
                <div style={{ ...cell(cols[1]), minWidth: 0 }}>
                  <div style={{ fontSize: nameSize, fontWeight: 500, color: theme.text,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                </div>
                <div style={cell(cols[2])}>
                  <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, color: theme.sub }}>{d.caseId}</span>
                </div>
                <div style={cell(cols[3])}>
                  <Tag tone={CASE_SOURCE[d.src]} theme={{ font: theme.font, radius: theme.radius }} />
                </div>
                <div style={{ ...cell(cols[4]), fontSize: 13, color: theme.sub,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.tool}</div>
                <div style={cell(cols[5])}>
                  <CaseStatusPill theme={theme} status={d.status} />
                </div>
                <div style={{ ...cell(cols[6]), fontSize: 13, color: theme.sub }}>{d.creator}</div>
                <div style={cell(cols[7])}>
                  <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, color: theme.sub }}>{d.t}</span>
                </div>
                <div style={cell(cols[8])}>
                  <a href="标注任务详情.html" style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.accent,
                    fontWeight: 500, textDecoration: 'none' }}>查看详情</a>
                </div>
              </div>
            ))}
          </div>

          {/* pagination */}
          <Pagination theme={theme} current={1} pages={CASE_PAGES} />
        </main>
      </div>
    </div>
  );
}

Object.assign(window, { CaseListShell, CaseStatusPill, CASES, CASE_SOURCE, CASE_STATUS });
