import { defineErrorCodes } from '../../infra/errors.js';

/** 对应 Java DatasetErrorCode（code 与中文文案一致）。 */
export const DatasetErrorCode = defineErrorCodes({
  DATASET_NAME_INVALID: '数据集名称不合法',
  DATASET_DESC_TOO_LONG: '数据集描述过长',
  OSS_PATH_REQUIRED: 'ossPath 不能为空',
  LABEL_TOOL_CODE_REQUIRED: 'labelToolCode 不能为空',
  DATASET_NAME_EXISTS: '数据集名称已存在',
  DATASET_NOT_FOUND: '数据集不存在',
  DATASET_VERSION_NOT_FOUND: '数据集版本不存在',
  VERSION_DESC_TOO_LONG: '版本描述过长',
  OPERATION_CONFLICT: '操作冲突，请稍后重试',
  UNSUPPORTED_FILE_TYPE: '不支持的文件类型',
  LABEL_TOOL_SCHEMA_MISSING: '标注工具未配置 JSON Schema，无法校验源数据',
  FILE_PARSE_FAILED: '文件解析失败',
  UPLOAD_FILE_NAME_REQUIRED: 'fileName 不能为空',
});
