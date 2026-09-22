// 分页规则（各模块一致，对应 Java 各 *Constants 与 normalizePageNum/Size）：
// pageNum 默认 1（<1 → PARAM_INVALID），pageSize 默认 20、范围 1-100。
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import type { Maybe } from './strings.js';

export const DEFAULT_PAGE_NUM = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;

export interface PageInput {
  pageNum?: Maybe<number>;
  pageSize?: Maybe<number>;
}

export interface PageParams {
  pageNum: number;
  pageSize: number;
  offset: number;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export function normalizePage(input: PageInput): PageParams {
  const pageNum = input.pageNum ?? DEFAULT_PAGE_NUM;
  if (pageNum < 1) throw ServiceError.of(CommonErrorCode.PARAM_INVALID, 'pageNum 需 >= 1');
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  if (pageSize < MIN_PAGE_SIZE || pageSize > MAX_PAGE_SIZE) {
    throw ServiceError.of(CommonErrorCode.PARAM_INVALID, 'pageSize 需在 1-100 之间');
  }
  return { pageNum, pageSize, offset: (pageNum - 1) * pageSize };
}

export function emptyPage<T>(params: PageParams): PageResult<T> {
  return { list: [], total: 0, pageNum: params.pageNum, pageSize: params.pageSize };
}
