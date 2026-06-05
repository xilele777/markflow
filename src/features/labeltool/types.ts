// labeltool 模块类型。对齐《接口文档.md》五。
import type { PageRequest } from '@/types/api';

/** getLabelToolList 出参元素。 */
export interface LabelToolListItem {
  labelToolId: number;
  labelToolCode: string;
  labelToolName: string;
  /** 1=内置 2=IFRAME（LABEL_TOOL_TYPE）。 */
  labelToolType: number;
}

export interface GetLabelToolListRequest extends PageRequest {
  keyword?: string;
}
