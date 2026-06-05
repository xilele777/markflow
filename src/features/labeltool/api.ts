// labeltool 接口函数（《接口层.md》§三）。路径 / 字段对齐《接口文档.md》五。
import { postPage } from '@/shared/api/http';
import type { PageResult } from '@/types/api';
import type { LabelToolListItem, GetLabelToolListRequest } from './types';

/** 标注工具列表 · POST /api/labeltool/getLabelToolList（分页，非空间内）。 */
export function getLabelToolList(
  req: GetLabelToolListRequest,
): Promise<PageResult<LabelToolListItem>> {
  return postPage<LabelToolListItem>('/labeltool/getLabelToolList', req);
}
