import { defineErrorCodes } from '../../infra/errors.js';

/** 对应 Java UserErrorCode。 */
export const UserErrorCode = defineErrorCodes({
  PERMISSION_DENIED: '无操作权限',
  INVALID_PARAM: '参数不合法',
  OPERATION_CONFLICT: '操作冲突，请稍后重试',
  USERNAME_EXISTS: '用户名已存在',
  LOGIN_FAILED: '用户名或密码错误',
  USER_DISABLED: '账号已被禁用',
  USER_INVALID: '用户不存在',
  WRONG_PASSWORD: '原密码错误',
  CANNOT_DISABLE_SELF: '不能禁用当前登录账号',
});
