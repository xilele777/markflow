// JSON Schema（Draft-07）编译校验，对应 Java JsonSchemaValidator（networknt V7）。
// 严格模式：未知关键字视为错误，防止把"数据样本"误当 schema 提交（后端索引 §2.6 的防呆）；
// format 只作注解不校验，避免 ajv 因未注册 format 而拒绝合法 schema。
// 创建标注工具时只要能编译；解析样本时用 allErrors 收集全部错误（networknt 默认报全部），出参截前 3 条。
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

export class JsonSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonSchemaError';
  }
}

export interface CompileOptions {
  /** 校验时收集全部错误（默认遇到第一个即停）。 */
  allErrors?: boolean;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createAjv(options: CompileOptions): Ajv {
  return new Ajv({
    strictSchema: true,
    strictNumbers: true,
    strictTypes: false,
    strictTuples: false,
    strictRequired: false,
    allowUnionTypes: true,
    validateFormats: false,
    allErrors: options.allErrors === true,
  });
}

/** 编译 schema；失败抛 JsonSchemaError（message 为 ajv 原因）。每次新建实例，避免同 $id 重复注册冲突。 */
export function compileJsonSchema(
  schema: Record<string, unknown>,
  options: CompileOptions = {},
): ValidateFunction {
  try {
    return createAjv(options).compile(schema);
  } catch (err) {
    throw new JsonSchemaError(err instanceof Error ? err.message : String(err));
  }
}

/** 把 ajv 错误压成一行（对应 Java ParseContext.briefMessages：最多 limit 条，以 "; " 连接）。 */
export function briefValidationErrors(errors: ErrorObject[] | null | undefined, limit = 3): string {
  if (!errors || errors.length === 0) return '未知校验错误';
  return errors
    .slice(0, limit)
    .map((e) => `${e.instancePath === '' ? '$' : `$${e.instancePath}`} ${e.message ?? e.keyword}`)
    .join('; ');
}
