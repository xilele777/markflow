// 提交前客户端校验：按标注工具 pageSchema 派生的输入字段，检查已保存结果里是否都有值。
// 只做「必填有值」这一层（后端 submit 仍会做最终校验）；IFRAME 工具无 pageSchema 时跳过。
import { deriveOutputFields, type SchemaField } from '@/features/labeltool/schemaInspect';

export interface ValidationResult {
  ok: boolean;
  /** 缺失（未填）的字段。 */
  missing: SchemaField[];
  /** pageSchema 派生出的全部输入字段（空表示无法校验）。 */
  fields: SchemaField[];
}

/** 值是否算「已填」：undefined / null / 空串 / 空数组视为未填；false / 0 视为已填。 */
export function isFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function validateResultAgainstSchema(
  pageSchema: Record<string, unknown> | null | undefined,
  result: Record<string, unknown> | null | undefined,
): ValidationResult {
  const fields = deriveOutputFields(pageSchema);
  if (fields.length === 0) return { ok: true, missing: [], fields };
  const r = result ?? {};
  const missing = fields.filter((f) => f.required !== false && !isFilled(r[f.name]));
  return { ok: missing.length === 0, missing, fields };
}

/** 给 toast 用的一句话。 */
export function describeMissing(missing: SchemaField[]): string {
  const names = missing.map((f) => f.name);
  const shown = names.slice(0, 3).join('、');
  const more = names.length > 3 ? ` 等 ${names.length} 项` : '';
  return `请先填写：${shown}${more}`;
}

// —— 父页（执行页）与嵌入页（iframe）之间的保存状态协议 ——
// 嵌入页在 setField 后立即发 dirty、保存成功后发 saved；父页提交前若 dirty 则等待 saved（有超时）。
export const EMBED_MESSAGE_TYPE = 'markflow:embed-result';
export type EmbedResultState = 'dirty' | 'saving' | 'saved' | 'error';
export interface EmbedResultMessage {
  type: typeof EMBED_MESSAGE_TYPE;
  taskId: number;
  state: EmbedResultState;
}

export function isEmbedResultMessage(data: unknown): data is EmbedResultMessage {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as { type?: unknown }).type === EMBED_MESSAGE_TYPE &&
    typeof (data as { taskId?: unknown }).taskId === 'number'
  );
}

export function postEmbedState(taskId: number, state: EmbedResultState) {
  if (typeof window === 'undefined' || window.parent === window) return;
  const msg: EmbedResultMessage = { type: EMBED_MESSAGE_TYPE, taskId, state };
  window.parent.postMessage(msg, window.location.origin);
}
