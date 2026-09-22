// 字符串小工具：空白判断与 LIKE 通配转义。

export type Maybe<T> = T | null | undefined;

/** 对应 Java `str == null || str.isBlank()`。 */
export function isBlank(value: Maybe<string>): boolean {
  return value === undefined || value === null || value.trim() === '';
}

export function hasText(value: Maybe<string>): value is string {
  return !isBlank(value);
}

/** 转义 LIKE / ILIKE 通配符，使用户输入按字面匹配（PG 默认转义字符为反斜杠）。 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 模糊搜索模式：`%关键字%`（去首尾空白）。 */
export function likePattern(keyword: string): string {
  return `%${escapeLike(keyword.trim())}%`;
}
