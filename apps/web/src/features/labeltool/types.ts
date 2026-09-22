// labeltool 模块类型。对齐《接口文档.md》五（接口文档位置见 memory: labeltool-puck-builder）。
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

/** getLabelToolDetail 出参（《接口文档.md》五）。 */
export interface LabelToolDetail {
  labelToolId: number;
  labelToolCode: string;
  labelToolName: string;
  /** 1=内置 2=IFRAME。 */
  labelToolType: number;
  /** IFRAME 地址（内置工具可能为空）。 */
  labelToolUrl: string;
  /** 源数据 JSON Schema（用于校验上传样本）。 */
  labelToolJsonSchema: Record<string, unknown> | null;
  /** Puck Data Structure（页面 UI 渲染用，回显标注界面）。透传返回，可空。 */
  labelToolPageSchema: Record<string, unknown> | null;
  creator: string;
  createTime: number;
}

/** createLabelTool 入参（《接口文档.md》五）。 */
export interface CreateLabelToolRequest {
  /** 工具编码（唯一）。 */
  labelToolCode: string;
  labelToolName: string;
  /** 1=内置(Puck) 2=IFRAME。 */
  labelToolType: number;
  /** IFRAME 类型必填。 */
  labelToolUrl?: string;
  /** 源数据 JSON Schema（必填）。内置工具下 = 数据源示例样本。 */
  labelToolJsonSchema: Record<string, unknown>;
  /** Puck Data Structure（可空，透传存储不校验）。 */
  labelToolPageSchema?: Record<string, unknown> | null;
}

export interface CreateLabelToolResponse {
  labelToolId: number;
}
