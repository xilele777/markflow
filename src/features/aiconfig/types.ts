// aiconfig 模块类型。对齐《接口文档.md》六。

/** getAiConfigList 出参元素。baseUrl / model / prompt 仅系统管理员可见，否则 null。 */
export interface AiConfigListItem {
  aiCode: string;
  name: string;
  labelToolCode: string;
  baseUrl: string | null;
  model: string | null;
  prompt: string | null;
}

export interface GetAiConfigListRequest {
  /** 按标注工具编码过滤。 */
  labelToolCode?: string;
}
