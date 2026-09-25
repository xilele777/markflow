// 对象键日期段与「按天分组 key」的共享格式化（R7，2026-09-25 抽取：dataset 上传键与
// case 导出键此前各持一份逐字重复实现，改规则时易只改一处造成上传 / 导出不一致）。
// en-CA locale 的日期格式即 YYYY-MM-DD，与业务时区无关。

/** 当天日期段 yyyyMMdd（按配置时区）。 */
export function datePart(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/-/g, '');
}

/** 按天分组 key：YYYY-MM-DD（按配置时区）。 */
export function dayKey(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}
