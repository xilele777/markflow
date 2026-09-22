// create-case-atoms.jsx — 新建标注任务页的表单原子 + 静态数据。
// 依赖 window：Glyph、STATUS。Exports：CC（一个命名空间对象，避免全局污染）

// ---- 静态数据 ----
const CC_TOOLS = [
  { code: 'dialog_tool', name: '对话标注器' },
  { code: 'text_tool',   name: '文本标注器' },
  { code: 'mm_tool',     name: '多模态标注器' },
  { code: 'image_tool',  name: '图像标注器' },
];

const CC_DATASETS = [
  { code: 'DS-1042', name: '医疗对话标注集', versions: [
    { id: 50240, v: 'v6', ready: false }, { id: 50231, v: 'v5', ready: true }, { id: 50180, v: 'v4', ready: true } ] },
  { code: 'DS-1031', name: '安全对齐标注集', versions: [
    { id: 31102, v: 'v2', ready: true }, { id: 31050, v: 'v1', ready: true } ] },
  { code: 'DS-1028', name: '多轮对话结果集', versions: [
    { id: 28410, v: 'v4', ready: true } ] },
];

// AI 配置随标注工具联动过滤
const CC_AICFG = [
  { code: 'ai_dialog_pre', name: '对话预标注模型', tool: 'dialog_tool' },
  { code: 'ai_dialog_qc',  name: '对话质检模型',   tool: 'dialog_tool' },
  { code: 'ai_text_pre',   name: '文本预标注模型', tool: 'text_tool' },
  { code: 'ai_text_qc',    name: '文本质检模型',   tool: 'text_tool' },
  { code: 'ai_mm_pre',     name: '多模态预标注模型', tool: 'mm_tool' },
  { code: 'ai_image_pre',  name: '图像预标注模型', tool: 'image_tool' },
];

const CC_MEMBERS = ['张未明', '李 航', '王 芮', '陈 思', '周 岚', '林 深', '郑 凯', '何 洁', '赵 铭', '吴 桐'];

// 固定顺序的 5 阶段
const CC_STAGES = [
  { type: 'aiPreLabel',  code: 1, label: 'AI 预标',  kind: 'ai' },
  { type: 'label',       code: 2, label: '人工标注', kind: 'human' },
  { type: 'aiPreReview', code: 3, label: 'AI 预审',  kind: 'ai' },
  { type: 'review',      code: 4, label: '人工初检', kind: 'human' },
  { type: 'recheck',     code: 5, label: '人工复检', kind: 'human' },
];

// ---- 表单原子 ----
function ccField(theme, disabled, mono) {
  return { width: '100%', height: 40, padding: '0 12px', borderRadius: theme.radius,
    border: `1px solid ${theme.border}`, background: disabled ? theme.fill : theme.surface,
    color: disabled ? theme.weak : theme.text, fontFamily: mono ? theme.font.mono : theme.font.body,
    fontSize: 13.5, outline: 'none', boxSizing: 'border-box', cursor: disabled ? 'not-allowed' : 'text' };
}

function Lbl({ theme, children, required, hint }) {
  return (
    <div style={{ marginBottom: 7, display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontFamily: theme.font.body, fontSize: 13, fontWeight: 500, color: theme.text }}>
        {children}{required && <span style={{ color: STATUS.failed.fg, marginLeft: 3 }}>*</span>}
      </span>
      {hint && <span style={{ fontFamily: theme.font.body, fontSize: 12, color: theme.weak }}>{hint}</span>}
    </div>
  );
}

function Text({ theme, value, onChange, placeholder, disabled, mono }) {
  return <input className="ls-field" value={value} disabled={disabled} placeholder={placeholder}
    onChange={(e) => onChange && onChange(e.target.value)} style={ccField(theme, disabled, mono)} />;
}

function Area({ theme, value, onChange, placeholder }) {
  return <textarea className="ls-field" value={value} placeholder={placeholder} rows={3}
    onChange={(e) => onChange && onChange(e.target.value)}
    style={{ ...ccField(theme), height: 'auto', padding: '10px 12px', lineHeight: 1.6, resize: 'vertical' }} />;
}

function Select({ theme, value, onChange, options, disabled, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <select className="ls-field" value={value} disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={{ ...ccField(theme, disabled), appearance: 'none', paddingRight: 32,
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: value ? (disabled ? theme.weak : theme.text) : theme.weak }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <Glyph name="chevron" size={13} color={theme.weak} />
      </span>
    </div>
  );
}

function Num({ theme, value, onChange, min = 0, suffix, w = 120 }) {
  return (
    <div style={{ position: 'relative', width: w }}>
      <input className="ls-field" type="number" min={min} value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...ccField(theme), paddingRight: suffix ? 42 : 12, fontFamily: theme.font.mono }} />
      {suffix && <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', fontFamily: theme.font.body, fontSize: 12.5, color: theme.weak }}>{suffix}</span>}
    </div>
  );
}

function Segmented({ theme, value, onChange, options }) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, gap: 3, background: theme.fill,
      borderRadius: theme.radius + 2, border: `1px solid ${theme.border}` }}>
      {options.map((o) => {
        const a = o.code === value;
        return (
          <button key={o.code} onClick={() => onChange(o.code)} style={{ height: 32, padding: '0 18px',
            borderRadius: theme.radius, border: 'none', cursor: 'pointer',
            fontFamily: theme.font.body, fontSize: 13, fontWeight: a ? 600 : 400,
            background: a ? theme.surface : 'transparent', color: a ? theme.text : theme.sub,
            boxShadow: a ? '0 1px 2px rgba(20,26,31,0.10)' : 'none', transition: 'all .12s' }}>{o.name}</button>
        );
      })}
    </div>
  );
}

function Switch({ theme, on, onClick, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick} style={{ width: 36, height: 20, borderRadius: 10,
      border: 'none', padding: 2, cursor: disabled ? 'not-allowed' : 'pointer',
      background: on ? theme.accent : theme.border, transition: 'background .15s',
      display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', alignItems: 'center',
      opacity: disabled ? 0.5 : 1, flex: 'none' }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 2px rgba(20,26,31,0.2)' }} />
    </button>
  );
}

function Card({ theme, title, desc, step, children }) {
  return (
    <section style={{ background: theme.surface, border: `1px solid ${theme.hairline}`,
      borderRadius: theme.radius + 1, padding: '20px 24px' }}>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {step && <span style={{ fontFamily: theme.font.mono, fontSize: 12, color: theme.weak }}>{step}</span>}
        <div>
          <h2 style={{ margin: 0, fontFamily: theme.font.display, fontSize: 15, fontWeight: 600, color: theme.text }}>{title}</h2>
          {desc && <p style={{ margin: '5px 0 0', fontFamily: theme.font.body, fontSize: 12.5, color: theme.sub }}>{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

const CC = { TOOLS: CC_TOOLS, DATASETS: CC_DATASETS, AICFG: CC_AICFG, MEMBERS: CC_MEMBERS, STAGES: CC_STAGES,
  Lbl, Text, Area, Select, Num, Segmented, Switch, Card, field: ccField };
Object.assign(window, { CC });
