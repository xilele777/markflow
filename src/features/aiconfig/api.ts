// aiconfig 接口函数（《接口层.md》§三）。路径 / 字段对齐《接口文档.md》六。
// AI 配置是全局资源（非空间内）。
import { post } from '@/shared/api/http';
import type {
  AiConfigListItem,
  CreateAiConfigRequest,
  GetAiConfigListRequest,
  UpdateAiConfigRequest,
} from './types';

/** AI 配置列表 · POST /api/aiconfig/getAiConfigList（无分页）。 */
export function getAiConfigList(
  req: GetAiConfigListRequest = {},
): Promise<{ list: AiConfigListItem[] }> {
  return post<{ list: AiConfigListItem[] }>('/aiconfig/getAiConfigList', req);
}

/** 创建 AI 配置 · POST /api/aiconfig/createAiConfig（系统管理员）。 */
export function createAiConfig(req: CreateAiConfigRequest): Promise<void> {
  return post<void>('/aiconfig/createAiConfig', req);
}

/** 更新 AI 配置 · POST /api/aiconfig/updateAiConfig（系统管理员）。
 *  apiKey 字段留空(undefined)时不会出现在 body 里，按与后端约定不覆盖原值。 */
export function updateAiConfig(req: UpdateAiConfigRequest): Promise<void> {
  return post<void>('/aiconfig/updateAiConfig', req);
}
