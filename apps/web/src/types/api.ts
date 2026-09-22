// 公共类型：统一响应包络（《接口层.md》§四）。
// 后端统一返回 { success, code, message, data, timestamp }；分页接口顶层额外有 total/pageNum/pageSize。

/** 通用响应包络。code 为业务码字符串：成功 'SUCCESS'，失败为语义错误码（如 'CASE_NOT_FOUND'）。 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  code: string;
  message: string;
  data: T;
  timestamp: number;
}

/** 分页接口的原始响应包络（顶层带分页字段，data 为列表）。 */
export interface PageResponse<T = unknown> extends ApiResponse<T[]> {
  total: number;
  pageNum: number;
  pageSize: number;
}

/** 拆包络后页面侧拿到的分页结果（见 http 响应拦截）。 */
export interface PageResult<T = unknown> {
  list: T[];
  total: number;
  pageNum: number;
  pageSize: number;
}

/** 分页请求公共参数。 */
export interface PageRequest {
  pageNum: number;
  pageSize: number;
}

/** 业务错误（success=false 时由 http 层抛出）。code 为业务错误码字符串。 */
export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}
