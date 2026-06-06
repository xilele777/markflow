// aiconfig 接口函数（《接口层.md》§三）。路径 / 字段对齐《接口文档.md》六。
// AI 配置是全局资源（非空间内）。
import { post } from '@/shared/api/http';
import type { AiConfigListItem, GetAiConfigListRequest } from './types';

/** AI 配置列表 · POST /api/aiconfig/getAiConfigList（无分页）。 */
export function getAiConfigList(
  req: GetAiConfigListRequest = {},
): Promise<{ list: AiConfigListItem[] }> {
  return post<{ list: AiConfigListItem[] }>('/aiconfig/getAiConfigList', req);
}
