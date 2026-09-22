import { defineErrorCodes } from '../../infra/errors.js';

export const MonitoringErrorCode = defineErrorCodes({
  DAYS_INVALID: '统计天数不合法',
});
