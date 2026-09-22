// dataset-detail.jsx — 数据集详情页（非全屏，嵌于框架内）
// 上：基本信息　下：版本列表（分页）　行内操作 → 右侧抽屉（样本预览 / 解析失败明细）
// Exports to window: DatasetDetailPage

// uploadStatus: 1 解析中 / 2 已就绪 / 3 解析失败
const UPLOAD_ST = { 1: 'running', 2: 'ready', 3: 'failed' };

const DATASET = {
  datasetId: 1042, spaceCode: 'MED-CORE', datasetName: '医疗对话标注集',
  datasetDesc: '面向医疗问诊场景的多轮对话标注数据，覆盖分诊、用药咨询与随访三类场景，用于对话模型的指令对齐与安全性训练。',
  labelToolCode: '对话标注器', latestVersionNumber: 6, creator: '张未明', createTime: '2026-04-02 10:15',
  category: 'annotate', sampleTotal: 12480,
};

const VERSIONS = [
  { versionId: 6, versionNumber: 6, versionDesc: '导入外部医疗对话集', uploadStatus: 1, sampleCount: null,  creator: '何 洁',  createTime: '2026-06-01 08:50' },
  { versionId: 5, versionNumber: 5, versionDesc: '增补 2 万条多轮随访对话', uploadStatus: 2, sampleCount: 12480, creator: '张未明', createTime: '2026-05-28 14:20' },
  { versionId: 4, versionNumber: 4, versionDesc: '修正标签体系与字段命名', uploadStatus: 2, sampleCount: 8330,  creator: '张未明', createTime: '2026-05-12 09:05' },
  { versionId: 3, versionNumber: 3, versionDesc: '清洗重复样本（解析失败）', uploadStatus: 3, sampleCount: 0,   creator: '李 航',  createTime: '2026-04-30 16:42',
    parseExt: { totalRowCount: 5200, successRowCount: 0, skippedRowCount: 180,
      parseFailureReason: '文件编码非 UTF-8，自第 3 行起字段错位，解析在第 12 行中断。',
      sampleErrors: [
        { rowNumber: 3,  error: '字段 messages 缺失，无法解析对话结构' },
        { rowNumber: 7,  error: 'role 取值非法（期望 user/assistant，实际 "doctor"）' },
        { rowNumber: 12, error: 'JSON 语法错误：第 12 行第 48 列存在未转义引号' },
        { rowNumber: 18, error: 'content 为空字符串' },
      ] } },
  { versionId: 2, versionNumber: 2, versionDesc: '首次场景扩充（用药咨询）', uploadStatus: 2, sampleCount: 7210, creator: '王 芮',  createTime: '2026-04-18 11:30' },
  { versionId: 1, versionNumber: 1, versionDesc: '初始版本', uploadStatus: 2, sampleCount: 5000, creator: '张未明', createTime: '2026-04-02 10:15' },
];
const VERSION_PAGES = 3;

// mock sample preview (top 10, here 4) for a ready version
const SAMPLE_PREVIEW = [
  { id: 90211, bizId: 'MED-7741', sampleData: { messages: [
      { role: 'user', content: '最近三天咳嗽有黄痰，要吃什么药？' },
      { role: 'assistant', content: '黄痰多提示细菌感染倾向，建议先就医明确，可在医生指导下使用祛痰药……' } ],
    label: { intent: '用药咨询', scene: '分诊', severity: '轻度' } } },
  { id: 90212, bizId: 'MED-7742', sampleData: { messages: [
      { role: 'user', content: '高血压患者可以打新冠疫苗吗？' },
      { role: 'assistant', content: '血压控制平稳时一般可以接种，急性期或血压未控制时建议暂缓……' } ],
    label: { intent: '接种咨询', scene: '随访', severity: '中度' } } },
  { id: 90213, bizId: null, sampleData: { messages: [
      { role: 'user', content: '孩子发烧 38.5℃ 需要去医院吗？' },
      { role: 'assistant', content: '精神状态好、能进食可先物理降温并观察；若持续高热或精神差应及时就诊……' } ],
    label: { intent: '分诊建议', scene: '分诊', severity: '中度' } } },
];

function MetaItem({ theme, label, value, mono }) {
  return (
    <div>
      <div style={{ fontFamily: theme.font.body, fontSize: 12, color: theme.weak, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: mono ? theme.font.mono : theme.font.body, fontSize: 13.5,
        color: theme.text, fontWeight: mono ? 400 : 500 }}>{value}</div>
    </div>
  );
}

function Json({ theme, data }) {
  return (
    <pre style={{ margin: 0, fontFamily: theme.font.mono, fontSize: 12, lineHeight: 1.7,
      color: theme.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function Drawer({ theme, open, onClose, children, title, subtitle }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, pointerEvents: open ? 'auto' : 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,26,31,0.34)',
        opacity: open ? 1 : 0, transition: 'opacity .22s' }} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 500, maxWidth: '92%',
        background: theme.surface, borderLeft: `1px solid ${theme.hairline}`,
        boxShadow: '-16px 0 48px -24px rgba(20,26,31,0.4)',
        transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .26s cubic-bezier(.2,.7,.3,1)',
        display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 'none', padding: '20px 24px', borderBottom: `1px solid ${theme.hairline}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontFamily: theme.font.display, fontSize: 17, fontWeight: 600, color: theme.text }}>{title}</div>
            {subtitle && <div style={{ fontFamily: theme.font.body, fontSize: 12.5, color: theme.sub, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: theme.radius, flex: 'none',
            border: `1px solid ${theme.border}`, background: theme.surface, color: theme.sub, cursor: 'pointer',
            fontSize: 16, lineHeight: 1, display: 'grid', placeItems: 'center' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

function PreviewBody({ theme, version }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontFamily: theme.font.body, fontSize: 12.5, color: theme.sub }}>
        仅预览前 10 条样本，按样本 id 升序 · 当前 {SAMPLE_PREVIEW.length} 条
      </div>
      {SAMPLE_PREVIEW.map((s) => (
        <div key={s.id} style={{ border: `1px solid ${theme.hairline}`, borderRadius: theme.radius + 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', flexWrap: 'wrap',
            background: theme.fill, borderBottom: `1px solid ${theme.hairline}` }}>
            <span style={{ fontFamily: theme.font.body, fontSize: 12, color: theme.weak }}>样本 id</span>
            <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, color: theme.text, whiteSpace: 'nowrap' }}>{s.id}</span>
            <span style={{ fontFamily: theme.font.body, fontSize: 12, color: theme.weak, marginLeft: 6 }}>bizId</span>
            <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, color: s.bizId ? theme.text : theme.weak, whiteSpace: 'nowrap' }}>{s.bizId || '—'}</span>
          </div>
          <div style={{ padding: '12px 14px' }}><Json theme={theme} data={s.sampleData} /></div>
        </div>
      ))}
    </div>
  );
}

function ErrorBody({ theme, version }) {
  const ext = version.parseExt;
  const stat = (label, value, tone) => (
    <div style={{ flex: 1, padding: '12px 14px', border: `1px solid ${theme.hairline}`, borderRadius: theme.radius + 1 }}>
      <div style={{ fontFamily: theme.font.body, fontSize: 12, color: theme.weak, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: theme.font.mono, fontSize: 18, color: tone || theme.text }}>{value}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: STATUS.failed.bg, color: STATUS.failed.fg, borderRadius: theme.radius + 1,
        padding: '12px 14px', fontFamily: theme.font.body, fontSize: 13, lineHeight: 1.6 }}>
        {ext.parseFailureReason}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {stat('总行数', fmt(ext.totalRowCount))}
        {stat('成功', fmt(ext.successRowCount), STATUS.ready.fg)}
        {stat('跳过', fmt(ext.skippedRowCount), STATUS.partial.fg)}
      </div>
      <div>
        <div style={{ fontFamily: theme.font.body, fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 8 }}>失败明细</div>
        <div style={{ border: `1px solid ${theme.hairline}`, borderRadius: theme.radius + 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', height: 36, alignItems: 'center', background: theme.fill,
            borderBottom: `1px solid ${theme.hairline}`, fontFamily: theme.font.body, fontSize: 12, color: theme.weak }}>
            <div style={{ width: 80, padding: '0 14px' }}>行号</div>
            <div style={{ flex: 1, padding: '0 14px' }}>错误信息</div>
          </div>
          {ext.sampleErrors.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', minHeight: 40, padding: '8px 0',
              borderBottom: i < ext.sampleErrors.length - 1 ? `1px solid ${theme.hairline}` : 'none' }}>
              <div style={{ width: 80, padding: '0 14px', fontFamily: theme.font.mono, fontSize: 12.5, color: theme.text }}>{e.rowNumber}</div>
              <div style={{ flex: 1, padding: '0 14px', fontFamily: theme.font.body, fontSize: 13, color: theme.sub, lineHeight: 1.5 }}>{e.error}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DatasetDetailPage({ theme }) {
  const [drawer, setDrawer] = React.useState(null); // { mode:'preview'|'error', version }
  const d = DATASET;

  const vcols = [
    { key: 'ver',  label: '版本号', w: 84, align: 'left' },
    { key: 'desc', label: '版本描述', flex: '1 1 auto', min: 180, align: 'left' },
    { key: 'st',   label: '解析状态', w: 116, align: 'left' },
    { key: 'n',    label: '样本数', w: 100, align: 'right' },
    { key: 'by',   label: '创建人', w: 92, align: 'left' },
    { key: 'time', label: '创建时间', w: 176, align: 'left' },
    { key: 'op',   label: '操作', w: 104, align: 'right' },
  ];
  const cell = (c) => ({ width: c.w, flex: c.flex || 'none', minWidth: c.min || 0,
    padding: '0 16px', boxSizing: 'border-box', textAlign: c.align });

  return (
    <div style={{ display: 'flex', height: '100%', background: theme.canvas, fontFamily: theme.font.body, color: theme.text }}>
      <Sidebar theme={theme} active="数据集" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar theme={theme} crumbs={[{ label: '资产' }, { label: '数据集', href: '数据集列表.html' }, { label: d.datasetName }]} />
        <main style={{ flex: 1, overflow: 'auto', padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── 上：基本信息 ── */}
          <section style={{ background: theme.surface, border: `1px solid ${theme.hairline}`,
            borderRadius: theme.radius + 1, padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h1 style={{ margin: 0, fontFamily: theme.font.display, fontWeight: 700, fontSize: 22,
                    color: theme.text, lineHeight: 1.2 }}>{d.datasetName}</h1>
                  <Tag tone={CATEGORY[d.category]} theme={{ font: theme.font, radius: theme.radius }} />
                </div>
                <p style={{ margin: '8px 0 0', fontFamily: theme.font.body, fontSize: 13.5, lineHeight: 1.65,
                  color: theme.sub, maxWidth: 760 }}>{d.datasetDesc}</p>
              </div>
              <Btn theme={theme} kind="ghost">编辑信息</Btn>
            </div>
            <div style={{ height: 1, background: theme.hairline, margin: '20px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '18px 24px' }}>
              <MetaItem theme={theme} label="数据集编号" value={'DS-' + d.datasetId} mono />
              <MetaItem theme={theme} label="所属空间" value={d.spaceCode} mono />
              <MetaItem theme={theme} label="绑定标注工具" value={d.labelToolCode} />
              <MetaItem theme={theme} label="最新版本" value={'v' + d.latestVersionNumber} mono />
              <MetaItem theme={theme} label="样本总数" value={fmt(d.sampleTotal)} mono />
              <MetaItem theme={theme} label="创建人" value={d.creator} />
              <MetaItem theme={theme} label="创建时间" value={d.createTime} mono />
            </div>
          </section>

          {/* ── 下：版本列表 ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            <h2 style={{ margin: 0, fontFamily: theme.font.display, fontSize: 15, fontWeight: 600, color: theme.text }}>版本</h2>
            <Btn theme={theme} kind="primary" icon="plus" href="新建版本.html">新建版本</Btn>
          </div>

          <div style={{ background: theme.surface, border: `1px solid ${theme.hairline}`,
            borderRadius: theme.radius + 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', height: 40, alignItems: 'center', background: theme.fill,
              borderBottom: `1px solid ${theme.hairline}` }}>
              {vcols.map((c) => (
                <div key={c.key} style={{ ...cell(c), fontFamily: theme.font.body, fontSize: 11.5,
                  fontWeight: 500, letterSpacing: '0.02em', color: theme.weak }}>{c.label}</div>
              ))}
            </div>
            {VERSIONS.map((v, i) => {
              const st = UPLOAD_ST[v.uploadStatus];
              return (
                <div key={v.versionId} style={{ display: 'flex', minHeight: 46, alignItems: 'center',
                  borderBottom: i < VERSIONS.length - 1 ? `1px solid ${theme.hairline}` : 'none' }}>
                  <div style={cell(vcols[0])}>
                    <span style={{ fontFamily: theme.font.mono, fontSize: 13, color: theme.text, fontWeight: 500 }}>v{v.versionNumber}</span>
                  </div>
                  <div style={{ ...cell(vcols[1]), fontSize: 13.5, color: theme.text,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.versionDesc}</div>
                  <div style={cell(vcols[2])}><StatusPill tone={STATUS[st]} theme={theme} /></div>
                  <div style={cell(vcols[3])}>
                    <span style={{ fontFamily: theme.font.mono, fontSize: 13,
                      color: v.sampleCount == null ? theme.weak : theme.text }}>
                      {v.sampleCount == null ? '—' : fmt(v.sampleCount)}</span>
                  </div>
                  <div style={{ ...cell(vcols[4]), fontSize: 13, color: theme.sub }}>{v.creator}</div>
                  <div style={{ ...cell(vcols[5]) }}>
                    <span style={{ fontFamily: theme.font.mono, fontSize: 12.5, color: theme.sub, whiteSpace: 'nowrap' }}>{v.createTime}</span>
                  </div>
                  <div style={cell(vcols[6])}>
                    {st === 'ready' && (
                      <a onClick={() => setDrawer({ mode: 'preview', version: v })}
                        style={{ fontSize: 13, color: theme.accent, fontWeight: 500, cursor: 'pointer' }}>样本预览</a>
                    )}
                    {st === 'failed' && (
                      <a onClick={() => setDrawer({ mode: 'error', version: v })}
                        style={{ fontSize: 13, color: STATUS.failed.fg, fontWeight: 500, cursor: 'pointer' }}>失败明细</a>
                    )}
                    {st === 'running' && (
                      <span style={{ fontSize: 13, color: theme.weak }}>解析中</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination theme={theme} current={1} pages={VERSION_PAGES} />
        </main>
      </div>

      <Drawer theme={theme} open={!!drawer} onClose={() => setDrawer(null)}
        title={drawer ? (drawer.mode === 'preview' ? `v${drawer.version.versionNumber} · 样本预览` : `v${drawer.version.versionNumber} · 解析失败明细`) : ''}
        subtitle={drawer ? drawer.version.versionDesc : ''}>
        {drawer && drawer.mode === 'preview' && <PreviewBody theme={theme} version={drawer.version} />}
        {drawer && drawer.mode === 'error' && <ErrorBody theme={theme} version={drawer.version} />}
      </Drawer>
    </div>
  );
}

Object.assign(window, { DatasetDetailPage });
