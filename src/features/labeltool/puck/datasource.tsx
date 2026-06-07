// 数据源：用户在「数据源」tab 粘贴一段示例样本 JSON，解析出字段（含嵌套），供组件「绑定字段」下拉选。
// 同时它就是编辑端画布的预览 sampleData；P3 由它推导 labelToolJsonSchema 存后端。
import { createContext, useContext } from 'react';

export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'null';

export interface FieldInfo {
  /** 点路径，如 `media.videoUrl`、`images.0.url`（getByPath 可直接读）。 */
  path: string;
  type: FieldType;
  /** 取值预览（截断），用于下拉里给用户参考。 */
  sample?: string;
}

export interface ParsedDataSource {
  sampleData: Record<string, unknown>;
  /** 可绑定字段（叶子值 + 数组路径），支持嵌套。 */
  fields: FieldInfo[];
  error?: string;
}

function previewOf(v: unknown): string {
  if (typeof v === 'string') return v.length > 24 ? `${v.slice(0, 24)}…` : v;
  return String(v);
}

const MAX_DEPTH = 5;

function flatten(value: unknown, prefix: string, out: FieldInfo[], depth: number): void {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(value)) {
    // 数组本身可绑定（列表类组件用），并下钻第 0 项给出代表性叶子路径。
    out.push({ path: prefix, type: 'array', sample: `数组（${value.length} 项）` });
    if (value.length) flatten(value[0], `${prefix}.0`, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${k}` : k;
      flatten((value as Record<string, unknown>)[k], p, out, depth + 1);
    }
    return;
  }
  if (!prefix) return; // 顶层就是基本类型，不当字段
  const type: FieldType =
    value === null ? 'null' : (typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string');
  out.push({ path: prefix, type, sample: value === null ? 'null' : previewOf(value) });
}

export function parseDataSource(text: string): ParsedDataSource {
  const t = text.trim();
  if (!t) return { sampleData: {}, fields: [] };
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const fields: FieldInfo[] = [];
      flatten(obj, '', fields, 0);
      return { sampleData: obj as Record<string, unknown>, fields };
    }
    return { sampleData: {}, fields: [], error: '数据源应为一个 JSON 对象' };
  } catch {
    return { sampleData: {}, fields: [], error: 'JSON 解析失败，请检查格式' };
  }
}

// ─── JSON Schema 推导 ────────────────────────────────────────────────────
// 把粘贴样本对象转成 Draft-07 JSON Schema：顶层 = object，properties 列出每个字段的子 schema，
// required 默认列出所有顶层字段名。后端 networknt 据此校验上传样本。

type JsonSchemaNode =
  | { type: 'string' }
  | { type: 'number' }
  | { type: 'integer' }
  | { type: 'boolean' }
  | { type: 'null' }
  | {
      type: 'object';
      properties?: Record<string, JsonSchemaNode>;
      required?: string[];
    }
  | { type: 'array'; items?: JsonSchemaNode };

function inferNode(value: unknown): JsonSchemaNode {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array' };
    return { type: 'array', items: inferNode(value[0]) };
  }
  if (typeof value === 'object') {
    const properties: Record<string, JsonSchemaNode> = {};
    const required: string[] = [];
    for (const k of Object.keys(value as Record<string, unknown>)) {
      properties[k] = inferNode((value as Record<string, unknown>)[k]);
      required.push(k);
    }
    const node: JsonSchemaNode = { type: 'object', properties };
    if (required.length) (node as { required?: string[] }).required = required;
    return node;
  }
  if (typeof value === 'number') return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}

/** 把样本对象推导为 Draft-07 JSON Schema（顶层 object，关键字保留）。 */
export function buildJsonSchema(sample: Record<string, unknown>): Record<string, unknown> {
  const node = inferNode(sample);
  // inferNode 一定返回 object 节点（因为入参就是对象），但显式断言以便 TS 收窄。
  const root = node as Extract<JsonSchemaNode, { type: 'object' }>;
  const schema: Record<string, unknown> = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: root.properties ?? {},
  };
  if (root.required && root.required.length) schema.required = root.required;
  return schema;
}

/** 当前数据源字段（编辑端注入，供绑定下拉读取）。 */
const DataSourceFieldsContext = createContext<FieldInfo[]>([]);

export const DataSourceFieldsProvider = DataSourceFieldsContext.Provider;

export function useDataSourceFields(): FieldInfo[] {
  return useContext(DataSourceFieldsContext);
}
