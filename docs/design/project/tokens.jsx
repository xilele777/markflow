// tokens.jsx — design tokens for the confirmed direction (工坊 · 浅色) + shared UI atoms.
// Exports to window: THEME, STATUS, CATEGORY, BrandMark, Avatar, Tag, StatusPill, Glyph

// ---- Semantic layers shared across ALL directions (per handoff doc) ----
const STATUS = {
  ready:    { bg: '#e7f4ec', fg: '#2c7a52', label: '就绪' },
  done:     { bg: '#e7f4ec', fg: '#2c7a52', label: '已完成' },
  running:  { bg: '#e9eff8', fg: '#3a5ea8', label: '解析中' },
  partial:  { bg: '#faf0d9', fg: '#8a6312', label: '部分成功' },
  failed:   { bg: '#fbe9e7', fg: '#a8423a', label: '解析失败' },
  idle:     { bg: '#f1f2f5', fg: '#565b66', label: '待分配' },
};
const CATEGORY = {
  annotate: { bg: '#eceefb', fg: '#454fae', label: '标注' },
  stream:   { bg: '#e2f1ee', fg: '#277268', label: '流式' },
  result:   { bg: '#f2eafa', fg: '#6b46a8', label: '结果' },
};

// ---- Confirmed direction: 工坊 · 浅色 (Workbench, Light) ----
// IBM Plex family + blue accent, executed in a refined, hairline, light manner.
// No dark surfaces anywhere.
const THEME = {
  id: 'F', name: '工坊 · 浅色', tagline: 'Workbench · Light',
  font: {
    display: "'IBM Plex Sans', sans-serif",
    body: "'IBM Plex Sans SC', sans-serif",
    mono: "'IBM Plex Mono', monospace",
  },
  canvas: '#f5f6f8', surface: '#ffffff', fill: '#eef0f3',
  hairline: '#e9ebef', border: '#dce0e6',
  text: '#171a1f', sub: '#586070', weak: '#9aa0ab', selected: '#eaecf1',
  accent: '#2f6df0', accentSoft: '#e8eefe',
  sidebar: { bg: '#ffffff', border: '#e9ebef', text: '#171a1f', sub: '#9aa0ab',
             groupLabel: '#9aa0ab', activeBg: '#eef2fb', activeText: '#171a1f',
             accentBar: true, accentBarColor: '#2f6df0' },
  radius: 6, primaryBtn: 'solid',
};

// ---- Simple geometric brand mark (no complex SVG) ----
function BrandMark({ theme, size = 22, color }) {
  const c = color || theme.accent;
  // a 2x2 offset-square lattice — "枢/pivot" feel, all simple rects
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2"  y="2"  width="8" height="8" rx="1.5" fill={c} />
      <rect x="13" y="2"  width="8" height="8" rx="1.5" fill={c} opacity="0.38" />
      <rect x="2"  y="13" width="8" height="8" rx="1.5" fill={c} opacity="0.38" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" fill={c} />
    </svg>
  );
}

function Avatar({ initials = '张', theme, size = 28, dark = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: dark ? '#2a2e36' : theme.fill,
      color: dark ? '#d4d7de' : theme.sub,
      display: 'grid', placeItems: 'center',
      fontFamily: theme.body, fontSize: size * 0.42, fontWeight: 500,
      border: `1px solid ${dark ? '#33373f' : theme.border}`,
      flex: 'none',
    }}>{initials}</div>
  );
}

// pill tag for category/status
function Tag({ tone, theme, children, mono }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: tone.bg, color: tone.fg,
      fontFamily: mono ? theme.font.mono : theme.font.body,
      fontSize: 12, fontWeight: 500, lineHeight: 1,
      padding: '4px 8px', borderRadius: theme.radius - 2,
      whiteSpace: 'nowrap',
    }}>{children || tone.label}</span>
  );
}

function StatusPill({ tone, theme }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: theme.font.body, fontSize: 13, color: tone.fg, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone.fg, flex: 'none' }} />
      {tone.label}
    </span>
  );
}

// tiny geometric glyphs for search / chevron / plus (simple primitives only)
function Glyph({ name, size = 14, color = 'currentColor', stroke = 1.6 }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'search') return (<svg {...p}><circle cx="7" cy="7" r="4.2" /><line x1="10.2" y1="10.2" x2="13.5" y2="13.5" /></svg>);
  if (name === 'chevron') return (<svg {...p}><polyline points="4,6 8,10 12,6" /></svg>);
  if (name === 'plus') return (<svg {...p}><line x1="8" y1="3.5" x2="8" y2="12.5" /><line x1="3.5" y1="8" x2="12.5" y2="8" /></svg>);
  if (name === 'arrow') return (<svg {...p}><line x1="3" y1="8" x2="13" y2="8" /><polyline points="9,4 13,8 9,12" /></svg>);
  if (name === 'filter') return (<svg {...p}><polygon points="2.5,4 13.5,4 9.5,8.5 9.5,12.5 6.5,11 6.5,8.5" /></svg>);
  if (name === 'dots') return (<svg {...p} strokeWidth="0" fill={color}><circle cx="4" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12" cy="8" r="1.3"/></svg>);
  if (name === 'upload') return (<svg {...p}><polyline points="5,6 8,3 11,6" /><line x1="8" y1="3" x2="8" y2="10.5" /><path d="M3 11.5 V13 H13 V11.5" /></svg>);
  if (name === 'file') return (<svg {...p}><path d="M4 2.5 h5 l3 3 V13.5 H4 Z" /><polyline points="9,2.5 9,5.5 12,5.5" /></svg>);
  if (name === 'x') return (<svg {...p}><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>);
  if (name === 'check') return (<svg {...p}><polyline points="3.5,8.5 6.5,11.5 12.5,4.5" /></svg>);
  return null;
}

Object.assign(window, { THEME, STATUS, CATEGORY, BrandMark, Avatar, Tag, StatusPill, Glyph });
