// aiconfig 模块类型。对齐《接口文档.md》六。

/** getAiConfigList 出参元素。
 *  ⚠️ apiKey 永不返回；baseUrl / model / prompt 仅系统管理员可见，否则 null。 */
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

/** createAiConfig 入参（系统管理员）。 */
export interface CreateAiConfigRequest {
  aiCode: string;
  name: string;
  labelToolCode: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}

/** updateAiConfig 入参（系统管理员）。aiCode 定位、不可变更；labelToolCode 不变更。
 *  apiKey 留空时不带在 body 里，与后端约定为「不覆盖原值」。 */
export interface UpdateAiConfigRequest {
  aiCode: string;
  name: string;
  baseUrl: string;
  model: string;
  prompt: string;
  /** 留空（undefined）则不传，后端保留原值。 */
  apiKey?: string;
}
