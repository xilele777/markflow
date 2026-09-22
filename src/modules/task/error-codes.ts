import { defineErrorCodes } from '../../infra/errors.js';

/** 对应 Java CaseErrorCode（code 与中文文案一致）。 */
export const CaseErrorCode = defineErrorCodes({
  CASE_NAME_INVALID: '标注任务名称不合法',
  CASE_NAME_EXISTS: '标注任务名称已存在',
  DESCRIPTION_TOO_LONG: '标注任务描述过长',
  DATA_SOURCE_TYPE_INVALID: '数据源类型不合法',
  LABEL_TOOL_REQUIRED: 'labelTool 不能为空',
  DATASET_VERSION_REQUIRED: '数据集模式必须指定 datasetVersionId',
  DATASET_VERSION_NOT_FOUND: '数据集版本不存在',
  DATASET_VERSION_NOT_READY: '数据集版本未就绪',
  TASK_PLAN_INVALID: '流程编排配置不合法',
  STAGE_TYPE_INVALID: 'stage 类型不合法',
  STAGE_CONFIG_MISSING: '缺少该 stage 的分配配置',
  STRATEGY_INVALID: '派发策略不合法',
  STRATEGY_NOT_ALLOWED: '当前数据源不支持该派发策略',
  STAGE_MEMBERS_REQUIRED: '人工 stage 必须配置成员',
  PRE_DISPATCH_SIZE_INVALID: '预派条数不合法',
  RATIO_INVALID: '固定分配比例不合法（active 成员比例之和需为 100）',
  AI_CODE_REQUIRED: 'AI stage 必须指定 aiCode',
  AI_CONFIG_LABEL_TOOL_MISMATCH: 'AI 配置绑定的标注工具与 case 不一致',
  MEMBER_NOT_IN_WORKSPACE: '成员不在该空间',
  MEMBER_ROLE_MISMATCH: '成员在该空间的角色不匹配',
  CASE_NOT_FOUND: '标注任务不存在',
  CASE_NOT_RUNNING: '标注任务非运行中',
  POOL_TYPE_INVALID: '池类型不合法（仅支持 2-6 的池，不含个人组）',
  POOL_NOT_FOUND: '对应 stage 的池子不存在',
  EXECUTOR_INACTIVE: '执行者不在该 stage 的 active 成员中',
  EXPORT_FORMAT_INVALID: '导出格式不合法（仅支持 csv / jsonl）',
  OPERATION_CONFLICT: '操作冲突，请稍后重试',
});

/** 对应 Java TaskErrorCode。 */
export const TaskErrorCode = defineErrorCodes({
  TASK_NOT_FOUND: '任务不存在',
  SAMPLE_NOT_FOUND: '数据样本不存在',
  SAMPLE_TYPE_INVALID: 'sampleType 不合法',
  LABEL_RESULT_NOT_FOUND: '标注结果 sample 不存在，无法写质检结果',
  TASK_TYPE_INVALID: 'task 类型与提交接口不匹配',
  TASK_ALREADY_COMPLETED: '任务已完成，请勿重复提交',
  RESULT_SAMPLE_NOT_FOUND: '标注结果为空，不能提交',
  REVIEW_ACTION_INVALID: 'reviewAction 不合法',
  PREVIOUS_STAGE_NOT_FOUND: '上一阶段不存在，无法驳回',
  REJECT_TARGET_NOT_FOUND: '上一阶段对应任务不存在，无法驳回',
});
