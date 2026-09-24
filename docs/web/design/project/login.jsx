// login.jsx — 登录页（编辑分栏 · 浅色工坊）. Exports to window: LoginPage

function LoginField({ theme, label, value, mono }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontFamily: theme.font.body, fontSize: 12.5,
        color: theme.sub, marginBottom: 7 }}>{label}</span>
      <div style={{ height: 44, borderRadius: theme.radius, background: theme.surface,
        border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', padding: '0 13px',
        fontFamily: mono ? theme.font.mono : theme.font.body, fontSize: 14, color: theme.text,
        letterSpacing: mono ? '0.06em' : 0 }}>{value}</div>
    </label>
  );
}

function FormBlock({ theme, gotoHref }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: theme.font.display, fontWeight: 700, fontSize: 22,
          color: theme.text }}>登录工作台</h2>
        <p style={{ margin: '7px 0 0', fontFamily: theme.font.body, fontSize: 13, color: theme.sub }}>
          使用平台账户进入数据生产空间</p>
      </div>
      <LoginField theme={theme} label="用户名" value="annotator.zhang" mono />
      <div>
        <LoginField theme={theme} label="密码" value="••••••••••" />
        <div style={{ textAlign: 'right', marginTop: 8 }}>
          <span style={{ fontFamily: theme.font.body, fontSize: 12, color: theme.weak }}>忘记密码？联系管理员</span>
        </div>
      </div>
      <a href={gotoHref} style={{ textDecoration: 'none', display: 'block', marginTop: 4 }}>
        <button style={{ width: '100%', height: 46, borderRadius: theme.radius, border: 'none',
          background: theme.accent, color: '#fff', fontFamily: theme.font.body, fontSize: 14.5,
          fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer' }}>登 录</button>
      </a>
    </div>
  );
}

function LoginPage({ theme, gotoHref = '数据集列表.html' }) {
  const stats = [['标注', '对话 / 文本 / 多模态'], ['质检', '初检 · 复检双轮'], ['协同', 'AI 预审 + 人工']];
  return (
    <div style={{ height: '100%', minHeight: 600, display: 'flex', background: theme.surface,
      fontFamily: theme.font.body, minWidth: 920 }}>
      {/* brand panel — light */}
      <div style={{ flex: '0 0 48%', background: theme.fill, position: 'relative',
        padding: '48px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        borderRight: `1px solid ${theme.hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandMark theme={theme} size={24} />
          <span style={{ fontFamily: theme.font.display, fontWeight: 700, fontSize: 19, color: theme.text }}>markflow</span>
          <span style={{ fontFamily: theme.font.mono, fontSize: 10, letterSpacing: '0.18em',
            color: theme.weak, marginLeft: 2, marginTop: 3 }}>MARKFLOW</span>
        </div>
        <div>
          <div style={{ fontFamily: theme.font.mono, fontSize: 11.5, letterSpacing: '0.18em',
            color: theme.accent, marginBottom: 18 }}>DATA · ANNOTATION · ALIGNMENT</div>
          <h1 style={{ margin: 0, fontFamily: theme.font.display, fontWeight: 600, fontSize: 42,
            lineHeight: 1.18, color: theme.text, textWrap: 'balance', letterSpacing: '-0.01em' }}>
            为大模型训练<br/>生产高质量数据</h1>
          <p style={{ margin: '20px 0 0', fontFamily: theme.font.body, fontSize: 15,
            lineHeight: 1.75, color: theme.sub, maxWidth: 400 }}>
            数据集管理、流程编排与 AI 协同标注，<br/>在一个工作空间内完成生产与质检闭环。</p>
        </div>
        <div style={{ display: 'flex', gap: 36, fontFamily: theme.font.body }}>
          {stats.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontFamily: theme.font.display, fontWeight: 600, fontSize: 15, color: theme.text }}>{k}</div>
              <div style={{ fontSize: 12, color: theme.weak, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      {/* form */}
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 44 }}>
        <div style={{ width: 352 }}><FormBlock theme={theme} gotoHref={gotoHref} /></div>
      </div>
    </div>
  );
}

Object.assign(window, { LoginPage });
