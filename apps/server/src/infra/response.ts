// 统一响应包络 {success, code, message, data, timestamp}；分页顶层追加 total/pageNum/pageSize。
import type { ErrorCode } from './errors.js';

export interface Envelope<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
  timestamp: number;
}

export interface PageEnvelope<T> extends Envelope<T[]> {
  total: number;
  pageNum: number;
  pageSize: number;
}

export const SUCCESS_CODE = 'SUCCESS';

export function ok<T = null>(data: T = null as T): Envelope<T> {
  return { success: true, code: SUCCESS_CODE, message: '', data, timestamp: Date.now() };
}

export function fail(errorCode: ErrorCode, message?: string): Envelope<null> {
  return {
    success: false,
    code: errorCode.code,
    message: message ?? errorCode.message,
    data: null,
    timestamp: Date.now(),
  };
}

export function page<T>(
  list: T[],
  total: number,
  pageNum: number,
  pageSize: number,
): PageEnvelope<T> {
  return { ...ok(list), total, pageNum, pageSize };
}

/** 领域层分页结果 → 分页包络。 */
export function pageOf<T>(result: {
  list: T[];
  total: number;
  pageNum: number;
  pageSize: number;
}): PageEnvelope<T> {
  return page(result.list, result.total, result.pageNum, result.pageSize);
}
