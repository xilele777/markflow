// 404 与统一错误处理（对应 Java GlobalExceptionHandler）：
// ServiceError → warn 日志 + fail 包络（HTTP 状态见 errors.ts）；
// zod / JSON 解析错误 → PARAM_INVALID；其它异常 → error 日志 + SYSTEM_ERROR（HTTP 200）。
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { CommonErrorCode, httpStatusOf, ServiceError } from '../../infra/errors.js';
import type { Logger } from '../../infra/logger.js';
import { fail } from '../../infra/response.js';
import { formatZodIssues } from './validate.js';

interface HttpLikeError {
  type?: string;
  status?: number;
  message?: string;
}

export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    res
      .status(404)
      .json(fail(CommonErrorCode.NOT_FOUND, `接口不存在: ${req.method} ${req.originalUrl}`));
  };
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const reqId = req.id;

    if (err instanceof ServiceError) {
      logger.warn({ reqId, code: err.code, message: err.message }, 'ServiceException');
      if (err.headers) res.set(err.headers);
      res.status(httpStatusOf(err.code)).json(fail(err.errorCode, err.message));
      return;
    }

    if (err instanceof ZodError) {
      const message = formatZodIssues(err);
      logger.warn({ reqId, message }, 'Param validation failed');
      res.status(200).json(fail(CommonErrorCode.PARAM_INVALID, message));
      return;
    }

    const httpErr = (err ?? {}) as HttpLikeError;
    if (httpErr.type === 'entity.parse.failed') {
      logger.warn({ reqId }, 'Malformed JSON body');
      res.status(200).json(fail(CommonErrorCode.PARAM_INVALID, '请求体不是合法 JSON'));
      return;
    }
    if (httpErr.type === 'entity.too.large') {
      logger.warn({ reqId }, 'Body too large');
      res.status(200).json(fail(CommonErrorCode.PARAM_INVALID, '请求体过大'));
      return;
    }
    if (typeof httpErr.status === 'number' && httpErr.status >= 400 && httpErr.status < 500) {
      logger.warn({ reqId, status: httpErr.status, message: httpErr.message }, 'Bad request');
      res.status(200).json(fail(CommonErrorCode.PARAM_INVALID, httpErr.message));
      return;
    }

    logger.error({ reqId, err }, 'Unhandled exception');
    res.status(200).json(fail(CommonErrorCode.SYSTEM_ERROR));
  };
}
