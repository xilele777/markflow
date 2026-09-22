/** LabelToolTypeEnum：BUILTIN=1（Puck 内置）, IFRAME=2（外部页面嵌入）。 */
export const LabelToolType = { BUILTIN: 1, IFRAME: 2 } as const;
export type LabelToolTypeCode = (typeof LabelToolType)[keyof typeof LabelToolType];

export function isLabelToolTypeCode(code: unknown): code is LabelToolTypeCode {
  return code === LabelToolType.BUILTIN || code === LabelToolType.IFRAME;
}
