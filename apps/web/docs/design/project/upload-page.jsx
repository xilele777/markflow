// upload-page.jsx — 数据上传页（占满内容区，非弹窗），参数化 mode：
//   'create'  → 创建数据集（填全部参数）
//   'version' → 创建数据集版本（数据集层参数置灰继承，只填版本描述 + 文件）
// 文件由前端直传 OSS（此处模拟上传进度）。Exports to window: UploadPage

const TOOL_OPTIONS = [
  { code: 'dialog_tool', name: '对话标注器' },
  { code: 'text_tool', name: '文本标注器' },
  { code: 'mm_tool', name: '多模态标注器' },
  { code: 'image_tool', name: '图像标注器' },
];

// 版本模式下继承的数据集上下文
const VERSION_CTX = { datasetId: 1042, datasetName: '医疗对话标注集', spaceCode: 'MED-CORE',
  labelToolCode: '对话标注器', latestVersionNumber: 6 };

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

function fieldStyle(theme, disabled, mono) {
  return {
    width: '100%', height: 40, padding: '0 12px', borderRadius: theme.radius,
    border: `1px solid ${theme.border}`, background: disabled ? theme.fill : theme.surface,
    color: disabled ? theme.weak : theme.text, fontFamily: mono ? theme.font.mono : theme.font.body,
    fontSize: 13.5, outline: 'none', boxSizing: 'border-box',
    cursor: disabled ? 'not-allowed' : 'text',
  };
}

function Text({ theme, value, onChange, placeholder, disabled, mono }) {
  return <input className="ls-field" value={value} disabled={disabled} placeholder={placeholder}
    onChange={(e) => onChange && onChange(e.target.value)} style={fieldStyle(theme, disabled, mono)} />;
}
function Area({ theme, value, onChange, placeholder }) {
  return <textarea className="ls-field" value={value} placeholder={placeholder} rows={3}
    onChange={(e) => onChange && onChange(e.target.value)}
    style={{ ...fieldStyle(theme), height: 'auto', padding: '10px 12px', lineHeight: 1.6, resize: 'vertical' }} />;
}
function Select({ theme, value, onChange, options, disabled, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <select className="ls-field" value={value} disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={{ ...fieldStyle(theme, disabled), appearance: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
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

function Card({ theme, title, desc, children }) {
  return (
    <section style={{ background: theme.surface, border: `1px solid ${theme.hairline}`,
      borderRadius: theme.radius + 1, padding: '20px 24px' }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontFamily: theme.font.display, fontSize: 15, fontWeight: 600, color: theme.text }}>{title}</h2>
        {desc && <p style={{ margin: '5px 0 0', fontFamily: theme.font.body, fontSize: 12.5, color: theme.sub }}>{desc}</p>}
      </div>
      {children}
    </section>
  );
}

const fmtSize = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

function Dropzone({ theme, file, onFile, onRemove }) {
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef(null);
  const pick = () => inputRef.current && inputRef.current.click();
  const handle = (f) => { if (f) onFile(f); };

  if (file) {
    const done = file.status === 'done';
    return (
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: theme.radius + 1, padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: theme.radius, flex: 'none', display: 'grid', placeItems: 'center',
          background: theme.accentSoft, color: theme.accent }}><Glyph name="file" size={18} color={theme.accent} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: theme.font.body, fontSize: 13.5, fontWeight: 500, color: theme.text,
              flex: '0 1 auto', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
            <span style={{ fontFamily: theme.font.mono, fontSize: 11.5, color: theme.weak, flex: 'none', whiteSpace: 'nowrap' }}>{fmtSize(file.size)}</span>
          </div>
          {/* progress / status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: theme.fill, overflow: 'hidden' }}>
              <div style={{ width: file.progress + '%', height: '100%', borderRadius: 3,
                background: done ? STATUS.ready.fg : theme.accent, transition: 'width .2s' }} />
            </div>
            {done
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: theme.font.body,
                  fontSize: 12, color: STATUS.ready.fg }}><Glyph name="check" size={13} color={STATUS.ready.fg} />已上传 OSS</span>
              : <span style={{ fontFamily: theme.font.mono, fontSize: 12, color: theme.sub }}>{file.progress}%</span>}
          </div>
          {done && <div style={{ fontFamily: theme.font.body, fontSize: 11.5, color: theme.weak, marginTop: 6 }}>上传完成，保存后将开始解析</div>}
        </div>
        <button onClick={onRemove} title="移除" style={{ width: 30, height: 30, borderRadius: theme.radius, flex: 'none',
          border: `1px solid ${theme.border}`, background: theme.surface, color: theme.weak, cursor: 'pointer',
          display: 'grid', placeItems: 'center' }}><Glyph name="x" size={13} color={theme.weak} /></button>
      </div>
    );
  }

  return (
    <div onClick={pick}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files && e.dataTransfer.files[0]); }}
      style={{ border: `1.5px dashed ${drag ? theme.accent : theme.border}`, borderRadius: theme.radius + 2,
        background: drag ? theme.accentSoft : theme.fill, padding: '34px 24px', textAlign: 'center', cursor: 'pointer',
        transition: 'background .15s, border-color .15s' }}>
      <input ref={inputRef} type="file" accept=".jsonl" style={{ display: 'none' }}
        onChange={(e) => handle(e.target.files && e.target.files[0])} />
      <div style={{ width: 44, height: 44, borderRadius: theme.radius + 2, margin: '0 auto 14px', display: 'grid', placeItems: 'center',
        background: theme.surface, border: `1px solid ${theme.border}`, color: theme.accent }}>
        <Glyph name="upload" size={20} color={theme.accent} />
      </div>
      <div style={{ fontFamily: theme.font.body, fontSize: 14, color: theme.text }}>
        将文件拖拽到此处，或 <span style={{ color: theme.accent, fontWeight: 600 }}>点击选择</span>
      </div>
      <div style={{ fontFamily: theme.font.body, fontSize: 12.5, color: theme.weak, marginTop: 7 }}>
        支持 Jsonl 格式文件
      </div>
    </div>
  );
}

function UploadPage({ theme, mode = 'create' }) {
  const isVer = mode === 'version';
  const [name, setName] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [tool, setTool] = React.useState('');
  const [verDesc, setVerDesc] = React.useState('');
  const [file, setFile] = React.useState(null);
  const timer = React.useRef(null);

  // focus ring style (once)
  React.useEffect(() => {
    const id = 'ls-field-style';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = `.ls-field:focus{border-color:${theme.accent}!important;box-shadow:0 0 0 3px ${theme.accentSoft}}`;
      document.head.appendChild(s);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const startUpload = (f) => {
    const obj = { name: f.name, size: f.size, progress: 0, status: 'uploading', ossPath: '' };
    setFile(obj);
    if (timer.current) clearInterval(timer.current);
    let p = 0;
    timer.current = setInterval(() => {
      p = Math.min(100, p + Math.round(8 + Math.random() * 16));
      if (p >= 100) {
        clearInterval(timer.current);
        const key = `med-core/datasets/2026/06/${f.name}`;
        setFile({ name: f.name, size: f.size, progress: 100, status: 'done', ossPath: key });
      } else {
        setFile((prev) => prev ? { ...prev, progress: p } : prev);
      }
    }, 220);
  };
  const removeFile = () => { if (timer.current) clearInterval(timer.current); setFile(null); };

  const uploaded = file && file.status === 'done';
  const valid = isVer ? uploaded : (name.trim() && tool && uploaded);

  const crumbs = isVer
    ? [{ label: '资产' }, { label: '数据集', href: '数据集列表.html' },
       { label: VERSION_CTX.datasetName, href: '数据集详情.html' }, { label: '新建版本' }]
    : [{ label: '资产' }, { label: '数据集', href: '数据集列表.html' }, { label: '新建数据集' }];
  const backHref = isVer ? '数据集详情.html' : '数据集列表.html';

  return (
    <div style={{ display: 'flex', height: '100%', background: theme.canvas, fontFamily: theme.font.body, color: theme.text }}>
      <Sidebar theme={theme} active="数据集" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar theme={theme} crumbs={crumbs} />

        {/* scrollable form region */}
        <main style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          <div style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Card theme={theme} title="基本信息"
              desc={isVer ? '版本继承所属数据集的配置，灰色字段不可修改' : undefined}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {isVer ? (
                  <React.Fragment>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                      <div><Lbl theme={theme}>所属数据集</Lbl>
                        <Text theme={theme} value={VERSION_CTX.datasetName} disabled /></div>
                      <div><Lbl theme={theme}>当前最新版本</Lbl>
                        <Text theme={theme} value={'v' + VERSION_CTX.latestVersionNumber} disabled mono /></div>
                    </div>
                    <div><Lbl theme={theme}>绑定标注工具</Lbl>
                      <Text theme={theme} value={VERSION_CTX.labelToolCode} disabled /></div>
                    <div><Lbl theme={theme} hint="选填">版本描述</Lbl>
                      <Area theme={theme} value={verDesc} onChange={setVerDesc} placeholder="说明本次版本的数据变化，如新增场景、清洗规则等" /></div>
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                      <div><Lbl theme={theme} required>数据集名称</Lbl>
                        <Text theme={theme} value={name} onChange={setName} placeholder="如：医疗对话标注集" /></div>
                      <div><Lbl theme={theme} required>绑定标注工具</Lbl>
                        <Select theme={theme} value={tool} onChange={setTool} options={TOOL_OPTIONS} placeholder="选择标注工具" /></div>
                    </div>
                    <div><Lbl theme={theme} hint="选填">描述</Lbl>
                      <Area theme={theme} value={desc} onChange={setDesc} placeholder="数据集用途、来源与场景说明" /></div>
                    <div><Lbl theme={theme} hint="选填">首版本描述</Lbl>
                      <Text theme={theme} value={verDesc} onChange={setVerDesc} placeholder="如：初始版本" /></div>
                  </React.Fragment>
                )}
              </div>
            </Card>

            <Card theme={theme} title="数据文件">
              <Dropzone theme={theme} file={file} onFile={startUpload} onRemove={removeFile} />
            </Card>
          </div>
        </main>

        {/* footer action bar */}
        <footer style={{ flex: 'none', height: 64, borderTop: `1px solid ${theme.hairline}`, background: theme.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '0 28px' }}>
          <Btn theme={theme} kind="ghost" href={backHref}>取消</Btn>
          <a href={valid ? backHref : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 20px',
              borderRadius: theme.radius, fontFamily: theme.font.body, fontSize: 13.5, fontWeight: 600,
              textDecoration: 'none', boxSizing: 'border-box',
              background: valid ? theme.accent : theme.fill, color: valid ? '#fff' : theme.weak,
              border: `1px solid ${valid ? theme.accent : theme.border}`,
              cursor: valid ? 'pointer' : 'not-allowed', pointerEvents: valid ? 'auto' : 'none' }}>
            {isVer ? '创建版本' : '创建数据集'}
          </a>
        </footer>
      </div>
    </div>
  );
}

Object.assign(window, { UploadPage });
