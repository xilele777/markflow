// 通用格式化工具。数字一律千分位（配合 mono 展示，《组件清单.md》）；时间戳为毫秒 Long（《接口文档.md》一）。
export const formatNumber = (n: number): string => n.toLocaleString('en-US');

const pad = (n: number): string => String(n).padStart(2, '0');

/** 毫秒时间戳 → YYYY-MM-DD。 */
export function formatDate(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 毫秒时间戳 → YYYY-MM-DD HH:mm。 */
export function formatDateTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${formatDate(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 毫秒时间戳 → 相对时间（'刚刚' / 'N 分钟前' / 'N 小时前' / 'N 天前'）。
 *  超过 30 天回落到 YYYY-MM-DD。 */
export function formatRelativeTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const diff = Date.now() - ms;
  if (diff < 0) return '刚刚'; // 时钟漂移容忍
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return formatDate(ms);
}

/** 毫秒数 → 简短耗时（< 1 分钟 → 'N s'；< 1 小时 → 'm:ss'；其余 → 'Hh Mm'）。 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min < 60) return `${min}:${pad(s)}`;
  const hr = Math.floor(min / 60);
  const m = min % 60;
  return `${hr}h ${m}m`;
}
