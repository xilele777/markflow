import { defineErrorCodes } from '../../infra/errors.js';

/** 对应 Java LabelToolErrorCode。 */
export const LabelToolErrorCode = defineErrorCodes({
  LABEL_TOOL_NOT_FOUND: '标注工具不存在',
  LABEL_TOOL_CODE_INVALID: '标注工具编码不合法',
  LABEL_TOOL_NAME_INVALID: '标注工具名称不合法',
  LABEL_TOOL_TYPE_INVALID: '标注工具类型不合法',
  LABEL_TOOL_URL_INVALID: '标注工具URL不能为空',
  LABEL_TOOL_JSON_SCHEMA_INVALID: 'labelToolJsonSchema 必须为非空 JSON 对象',
  LABEL_TOOL_CODE_EXISTS: '标注工具编码已存在',
  OPERATION_CONFLICT: '操作冲突，请稍后重试',
});
