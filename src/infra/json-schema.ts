// JSON Schema（Draft-07）编译校验，对应 Java JsonSchemaValidator（networknt V7）。
// 严格模式：未知关键字视为错误，防止把"数据样本"误当 schema 提交（后端索引 §2.6 的防呆）；
// format 只作注解不校验，避免 ajv 因未注册 format 而拒绝合法 schema。M2 解析样本时复用同一配置。
import { Ajv, type ValidateFunction } from 'ajv';

export class JsonSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonSchemaError';
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createAjv(): Ajv {
  return new Ajv({
    strictSchema: true,
    strictNumbers: true,
    strictTypes: false,
    strictTuples: false,
    strictRequired: false,
    allowUnionTypes: true,
    validateFormats: false,
    allErrors: false,
  });
}

/** 编译 schema；失败抛 JsonSchemaError（message 为 ajv 原因）。每次新建实例，避免同 $id 重复注册冲突。 */
export function compileJsonSchema(schema: Record<string, unknown>): ValidateFunction {
  try {
    return createAjv().compile(schema);
  } catch (err) {
    throw new JsonSchemaError(err instanceof Error ? err.message : String(err));
  }
}
