// 错误码与业务异常。code 字符串沿用灵枢 Java 各 *ErrorCode 的枚举名，message 为中文。
// HTTP 状态：UNAUTHORIZED→401、FORBIDDEN/PERMISSION_DENIED→403、TOO_MANY_REQUESTS→429，其余 200
// （规划 0002 §1；这是相对原 Java 后端"恒 200"的有意改进，前端 http.ts 只在 401 时跳登录）。

export interface ErrorCode {
  readonly code: string;
  readonly message: string;
}

/** 由 { CODE: '中文说明' } 生成错误码常量表，code 即键名。 */
export function defineErrorCodes<const T extends Record<string, string>>(
  defs: T,
): { readonly [K in keyof T]: ErrorCode } {
  const out: Record<string, ErrorCode> = {};
  for (const [code, message] of Object.entries(defs)) out[code] = Object.freeze({ code, message });
  return Object.freeze(out) as { readonly [K in keyof T]: ErrorCode };
}

export const CommonErrorCode = defineErrorCodes({
  SYSTEM_ERROR: '系统内部错误',
  PARAM_INVALID: '参数校验失败',
  NOT_FOUND: '资源不存在',
  UNAUTHORIZED: '未授权',
  FORBIDDEN: '无权限',
  TOO_MANY_REQUESTS: '操作过于频繁',
});

const HTTP_STATUS_BY_CODE: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  PERMISSION_DENIED: 403,
  TOO_MANY_REQUESTS: 429,
};

export function httpStatusOf(code: string): number {
  return HTTP_STATUS_BY_CODE[code] ?? 200;
}

export interface ServiceErrorOptions {
  cause?: unknown;
  /** 随失败响应一起写出的响应头（如限流的 Retry-After）。 */
  headers?: Record<string, string>;
}

/** 业务异常：直接映射为失败包络。业务拒绝不打堆栈日志。 */
export class ServiceError extends Error {
  readonly errorCode: ErrorCode;
  readonly headers: Record<string, string> | undefined;

  constructor(errorCode: ErrorCode, message?: string, options?: ServiceErrorOptions) {
    super(
      message ?? errorCode.message,
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'ServiceError';
    this.errorCode = errorCode;
    this.headers = options?.headers;
  }

  get code(): string {
    return this.errorCode.code;
  }

  static of(errorCode: ErrorCode, message?: string, options?: ServiceErrorOptions): ServiceError {
    return new ServiceError(errorCode, message, options);
  }
}
