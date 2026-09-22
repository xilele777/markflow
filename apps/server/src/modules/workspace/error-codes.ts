import { defineErrorCodes } from '../../infra/errors.js';

/** 对应 Java WorkspaceErrorCode。 */
export const WorkspaceErrorCode = defineErrorCodes({
  SPACE_CODE_INVALID: '空间编码不合法',
  NAME_INVALID: '空间名称不合法',
  SPACE_CODE_EXISTS: '空间编码已存在',
  WORKSPACE_NOT_FOUND: '工作空间不存在',
  OPERATION_CONFLICT: '操作冲突，请稍后重试',
});
