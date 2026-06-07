// 近 N 天活跃趋势柱状图（自绘 SVG，0 依赖）。
// 后端的 last30Days 是稀疏数组（没任务的日期缺失），所以前端要补齐 0 值。
// 视窗：7 / 30 切换；30 天时柱子细一点、X 轴每 5 天打一个标签。
import { useMemo, useState, type CSSProperties } from 'react';
import { palette, fonts } from '@/app/theme';
import type { DayCount } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

/** 把稀疏数组补齐成最近 30 天每天一项（本地时区）。 */
function densifyLast30(sparse: DayCount[]): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (const d of sparse) map.set(d.date, d.count);
  const out: { date: string; count: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    out.push({ date: iso, count: map.get(iso) ?? 0 });
  }
  return out;
}

type RangeKey = '7' | '30';

interface Props {
  last30Days: DayCount[];
}

export function ActivityChart({ last30Days }: Props) {
  const [range, setRange] = useState<RangeKey>('30');

  const dense = useMemo(() => densifyLast30(last30Days ?? []), [last30Days]);
  const data = range === '7' ? dense.slice(-7) : dense;
  const max = Math.max(...data.map((d) => d.count), 1); // 至少 1 避免除零
  const total = data.reduce((s, d) => s + d.count, 0);

  // SVG 内坐标：viewBox 用一个稳定数字，外层 CSS 100% 响应式宽度。
  const W = 900;
  const H = 220;
  const PADL = 32; // 左留 Y 轴标签
  const PADR = 12;
  const PADT = 16;
  const PADB = 32; // 底留 X 轴标签
  const chartW = W - PADL - PADR;
  const chartH = H - PADT - PADB;
  const slot = chartW / data.length;
  const barW = Math.max(slot * 0.6, 2);

  // 鼠标 hover 状态
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);

  // Y 轴刻度（4 等分，包含 0 和 max；取人类可读的整数 step）。
  const yTicks = niceTicks(max, 4);
  const yMax = yTicks[yTicks.length - 1];

  // X 轴稀疏标签：30 天每 5 天 / 7 天每天。
  const labelEvery = range === '7' ? 1 : 5;

  return (
    <div style={cardStyle}>
      <div style={headRow}>
        <div>
          <div style={titleStyle}>近期活跃</div>
          <div style={subtitleStyle}>
            {range === '7' ? '最近 7 天' : '最近 30 天'} 共完成{' '}
            <span style={{ fontFamily: fonts.mono, color: palette.text, fontWeight: 600 }}>
              {total}
            </span>{' '}
            条
          </div>
        </div>
        <div style={segGroup}>
          <SegBtn active={range === '7'} onClick={() => setRange('7')}>
            7 天
          </SegBtn>
          <SegBtn active={range === '30'} onClick={() => setRange('30')}>
            30 天
          </SegBtn>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: H, display: 'block' }}
          onMouseLeave={() => setHover(null)}
        >
          {/* Y 轴网格线 + 刻度 */}
          {yTicks.map((tv) => {
            const y = PADT + chartH - (tv / yMax) * chartH;
            return (
              <g key={tv}>
                <line
                  x1={PADL}
                  x2={W - PADR}
                  y1={y}
                  y2={y}
                  stroke={palette.hairline}
                  strokeDasharray={tv === 0 ? undefined : '3 4'}
                />
                <text
                  x={PADL - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontFamily={fonts.mono}
                  fontSize={10}
                  fill={palette.weak}
                >
                  {tv}
                </text>
              </g>
            );
          })}

          {/* 柱子 + 透明命中区域 */}
          {data.map((d, i) => {
            const x = PADL + i * slot + (slot - barW) / 2;
            const h = (d.count / yMax) * chartH;
            const y = PADT + chartH - h;
            const isActive = hover?.idx === i;
            return (
              <g key={d.date}>
                {/* 命中区域：用 slot 大小覆盖以便柱子细也能 hover */}
                <rect
                  x={PADL + i * slot}
                  y={PADT}
                  width={slot}
                  height={chartH}
                  fill="transparent"
                  onMouseEnter={() => setHover({ idx: i, x: x + barW / 2, y })}
                />
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, d.count > 0 ? 2 : 0)}
                  rx={2}
                  fill={isActive ? palette.text : palette.accent}
                  opacity={d.count === 0 ? 0.18 : 1}
                />
              </g>
            );
          })}

          {/* X 轴标签 */}
          {data.map((d, i) => {
            if (i % labelEvery !== 0 && i !== data.length - 1) return null;
            const cx = PADL + i * slot + slot / 2;
            const mmdd = d.date.slice(5);
            return (
              <text
                key={d.date + '-x'}
                x={cx}
                y={H - PADB + 16}
                textAnchor="middle"
                fontFamily={fonts.mono}
                fontSize={10}
                fill={palette.weak}
              >
                {mmdd}
              </text>
            );
          })}
        </svg>

        {/* Tooltip：跟随 hover 状态绝对定位（基于 viewBox 百分比换算） */}
        {hover && (
          <Tooltip
            text={`${data[hover.idx].date} · ${data[hover.idx].count} 条`}
            // 把 SVG 内坐标按比例转为容器内 % 坐标
            leftPct={(hover.x / W) * 100}
            topPct={(hover.y / H) * 100}
          />
        )}
      </div>
    </div>
  );
}

function Tooltip({ text, leftPct, topPct }: { text: string; leftPct: number; topPct: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: 'translate(-50%, -120%)',
        background: palette.text,
        color: '#fff',
        fontSize: 12,
        fontFamily: fonts.body,
        padding: '4px 8px',
        borderRadius: 5,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,.18)',
      }}
    >
      {text}
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 28,
        padding: '0 14px',
        borderRadius: 6,
        border: `1px solid ${active ? palette.accent : palette.border}`,
        background: active ? palette.accent : palette.surface,
        color: active ? '#fff' : palette.sub,
        fontFamily: fonts.body,
        fontSize: 12.5,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background .15s, color .15s, border-color .15s',
      }}
    >
      {children}
    </button>
  );
}

/** 给定 max 算出 N+1 个均匀刻度（含 0，末尾 ≥ max，且 step 为人类可读整数）。 */
function niceTicks(max: number, n: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / n;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step: number;
  if (norm < 1.5) step = 1 * mag;
  else if (norm < 3) step = 2 * mag;
  else if (norm < 7) step = 5 * mag;
  else step = 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(Math.round(v));
  return ticks;
}

// —— 视觉 token ————————————————————————————————————————————————

const cardStyle: CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.hairline}`,
  borderRadius: 9,
  padding: '20px 24px',
};
const headRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 12,
};
const titleStyle: CSSProperties = {
  fontFamily: fonts.display,
  fontSize: 15,
  fontWeight: 600,
  color: palette.text,
};
const subtitleStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: 12.5,
  color: palette.sub,
  marginTop: 4,
};
const segGroup: CSSProperties = { display: 'flex', gap: 6 };
