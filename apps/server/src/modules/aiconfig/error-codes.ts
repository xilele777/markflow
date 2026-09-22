import { defineErrorCodes } from '../../infra/errors.js';

/** 对应 Java AiConfigErrorCode。 */
export const AiConfigErrorCode = defineErrorCodes({
  AI_CODE_INVALID: 'AI 配置编码不合法',
  AI_NAME_INVALID: 'AI 配置名称不合法',
  AI_CONFIG_FIELD_REQUIRED: 'AI 配置必填字段不能为空',
  AI_CODE_EXISTS: 'AI 配置编码已存在',
  AI_CONFIG_NOT_FOUND: 'AI 配置不存在',
  OPERATION_CONFLICT: '操作冲突，请稍后重试',
});
