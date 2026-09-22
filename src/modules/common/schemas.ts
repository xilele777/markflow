// 路由层 zod 片段：只约束 JSON 类型（错类型 → PARAM_INVALID），
// 空值与语义规则交给领域层，返回 Java 同款错误码与文案。
import { z } from 'zod';

export const optionalString = z.string().nullable().optional();
export const optionalInt = z.number().int().nullable().optional();
export const optionalBoolean = z.boolean().nullable().optional();

export const pageFields = { pageNum: optionalInt, pageSize: optionalInt } as const;
