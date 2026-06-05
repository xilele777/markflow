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
