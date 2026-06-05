// 语义色板（《配色规范.md》五/六）。状态色 STATUS + 分类色 CATEGORY = 颜色唯一真源。
// 组件不得自建状态色 map、不得硬编码色值；Tag/StatusDot 一律从这里取 tone。

/** 一个语义色：底色 + 字/圆点色 + 默认文案。 */
export interface Tone {
  bg: string;
  fg: string;
  label: string;
}

/** 状态色板（浅底 + 中调字；圆点取 fg 色）。StatusDot 用。 */
export const STATUS = {
  ready: { bg: '#e7f4ec', fg: '#2c7a52', label: '就绪' },
  done: { bg: '#e7f4ec', fg: '#2c7a52', label: '已完成' },
  running: { bg: '#e9eff8', fg: '#3a5ea8', label: '进行中' },
  partial: { bg: '#faf0d9', fg: '#8a6312', label: '部分成功' },
  failed: { bg: '#fbe9e7', fg: '#a8423a', label: '失败' },
  idle: { bg: '#f1f2f5', fg: '#565b66', label: '空闲' },
} as const satisfies Record<string, Tone>;

/** 分类色板（仅区分，避开状态色相）。Tag 用。 */
export const CATEGORY = {
  annotate: { bg: '#eceefb', fg: '#454fae', label: '标注' },
  stream: { bg: '#e2f1ee', fg: '#277268', label: '流式' },
  result: { bg: '#f2eafa', fg: '#6b46a8', label: '结果' },
} as const satisfies Record<string, Tone>;

/** 中性标签（不上色的枚举，如标注工具类型）。 */
export const NEUTRAL: Tone = { bg: '#eef0f3', fg: '#586070', label: '' };

export type StatusToneKey = keyof typeof STATUS;
export type CategoryToneKey = keyof typeof CATEGORY;
