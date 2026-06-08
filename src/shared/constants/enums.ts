// 业务枚举 → { 文案, tone } 唯一真源（《状态映射.md》）。后端 code 含义以《接口文档.md》为准。
// 组件只读这里；新增枚举值在此补，不散落进页面。
import { STATUS, CATEGORY, NEUTRAL, type Tone } from './tones';

/** 一个枚举值的展示元数据：文案 + 取色 tone。 */
export interface EnumMeta {
  label: string;
  tone: Tone;
}

type EnumMap = Record<number, EnumMeta>;

/** 一、case 状态（label_case.status）—— StatusDot。 */
export const CASE_STATUS: EnumMap = {
  1: { label: '未启动', tone: STATUS.idle },
  2: { label: '运行中', tone: STATUS.running },
  3: { label: '已暂停', tone: STATUS.partial },
  4: { label: '已结束', tone: STATUS.done },
};

/** 二、task 状态（label_task.status）—— StatusDot。 */
export const TASK_STATUS: EnumMap = {
  1: { label: '待分配', tone: STATUS.idle },
  2: { label: '标注中', tone: STATUS.running },
  3: { label: '质检中', tone: STATUS.running },
  4: { label: '已完成', tone: STATUS.done },
  5: { label: '打回重标', tone: STATUS.failed },
};

/** 三、任务组状态（label_task_group.status）—— StatusDot。 */
export const TASK_GROUP_STATUS: EnumMap = {
  1: { label: '待执行', tone: STATUS.idle },
  2: { label: '执行中', tone: STATUS.running },
  3: { label: '已完成', tone: STATUS.done },
};

/** 四、数据集类型（dataset_type）—— Tag。 */
export const DATASET_TYPE: EnumMap = {
  1: { label: '标注', tone: CATEGORY.annotate },
  2: { label: '流式', tone: CATEGORY.stream },
  3: { label: '结果', tone: CATEGORY.result },
};

/** 五、Case 数据源（dataSourceType）—— Tag。 */
export const DATA_SOURCE_TYPE: EnumMap = {
  1: { label: '数据集', tone: CATEGORY.annotate },
  2: { label: '流式', tone: CATEGORY.stream },
};

/** 六、stage 类型（taskType / stage code 1-5）—— Tag。长名固定。 */
export const STAGE_TYPE: EnumMap = {
  1: { label: 'AI 预标注', tone: CATEGORY.annotate },
  2: { label: '人工标注', tone: CATEGORY.annotate },
  3: { label: 'AI 预审', tone: CATEGORY.result },
  4: { label: '人工初检', tone: CATEGORY.result },
  5: { label: '人工复检', tone: CATEGORY.result },
};

/** 七、数据集版本解析状态（uploadStatus）—— StatusDot。 */
export const UPLOAD_STATUS: EnumMap = {
  1: { label: '解析中', tone: STATUS.running },
  2: { label: '就绪', tone: STATUS.ready },
  3: { label: '解析失败', tone: STATUS.failed },
};

/** 八 · 用户状态（0=正常 1=禁用）—— StatusDot。 */
export const USER_STATUS: EnumMap = {
  0: { label: '正常', tone: STATUS.done },
  1: { label: '禁用', tone: STATUS.idle },
};

/** 八 · 标注工具类型（labelToolType，中性标签）。 */
export const LABEL_TOOL_TYPE: EnumMap = {
  1: { label: '内置', tone: NEUTRAL },
  2: { label: 'IFRAME', tone: NEUTRAL },
};

/** 九 · 任务组类型（getTaskGroupList.type 1-6）—— Tag。个人组 vs 各种池。 */
export const TASK_GROUP_TYPE: EnumMap = {
  1: { label: '个人组', tone: NEUTRAL },
  2: { label: 'AI 预标池', tone: CATEGORY.annotate },
  3: { label: '人工标注池', tone: CATEGORY.annotate },
  4: { label: 'AI 预审池', tone: CATEGORY.result },
  5: { label: '初检池', tone: CATEGORY.result },
  6: { label: '复检池', tone: CATEGORY.result },
};

/** 八 · 派发策略（strategy，纯文字，无色）。 */
export const STRATEGY_TEXT: Record<number, string> = {
  1: '先到先得',
  2: '固定分配',
};

/** 八 · 空间角色（role，纯文字，无色，给 Select 之类的下拉用）。 */
export const ROLE_TEXT: Record<number, string> = {
  1: '标注员',
  2: '审核员',
  3: '标注管理员',
};

/** 九 · 空间角色 Tag 元数据（label + tone），给成员列表 / 头像角色 chip 这类 Tag 渲染用。
 *  色相分配：标注员=分类蓝紫（最基础）、审核员=分类绿（跟审核通过语义贴）、标注管理员=分类紫（最显眼）。 */
export const ROLE_META: EnumMap = {
  1: { label: '标注员', tone: CATEGORY.annotate },
  2: { label: '审核员', tone: CATEGORY.stream },
  3: { label: '标注管理员', tone: CATEGORY.result },
};

/** 兜底取值：未知 code 时返回中性「—」，避免页面崩。 */
export function metaOf(map: EnumMap, code: number | null | undefined): EnumMeta {
  if (code == null || !(code in map)) return { label: '—', tone: NEUTRAL };
  return map[code];
}
