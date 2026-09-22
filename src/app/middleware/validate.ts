// zod 请求体校验：失败 → PARAM_INVALID，message 形如 "field: msg; field2: msg"（与 Java 校验失败格式一致）。
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

export function validateBody<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      throw ServiceError.of(CommonErrorCode.PARAM_INVALID, formatZodIssues(result.error));
    }
    req.body = result.data;
    next();
  };
}
