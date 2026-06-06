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

/** 当前数据源字段（编辑端注入，供绑定下拉读取）。 */
const DataSourceFieldsContext = createContext<FieldInfo[]>([]);

export const DataSourceFieldsProvider = DataSourceFieldsContext.Provider;

export function useDataSourceFields(): FieldInfo[] {
  return useContext(DataSourceFieldsContext);
}
