// app/theme.ts —— 《配色规范.md》token 的唯一落地处。
// 全局只此一处：① palette = 中性/强调色 + 字体（颜色真源）；② antdTheme = 注入 ConfigProvider。
// 语义色（状态/分类）不在这里，见 shared/constants（《状态映射.md》）。

import type { ThemeConfig } from 'antd';

/** 工坊·浅色：中性外壳 + 强调蓝。值取自《配色规范.md》，禁止在别处硬编码。 */
export const palette = {
  // 中性色（外壳）
  canvas: '#f5f6f8', // 画布底色
  surface: '#ffffff', // 卡片 / 侧栏 / 顶栏
  fill: '#eef0f3', // 浅填充（表头底、chip 底、hover）
  hairline: '#e9ebef', // 发丝分隔线
  border: '#dce0e6', // 控件 / 卡片边框
  text: '#171a1f', // 主文字
  sub: '#586070', // 次文字
  weak: '#9aa0ab', // 弱文字 / 占位符 / 分组标题
  selected: '#eaecf1', // 通用选中底

  // 强调色（交互蓝）
  accent: '#2f6df0', // 实心主按钮、链接、选中、焦点
  accentSoft: '#e8eefe', // 强调浅底（选中 chip 底等）
  activeBg: '#eef2fb', // 侧栏当前菜单项底色
} as const;

/** IBM Plex 全家族。 */
export const fonts = {
  display: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  body: "'IBM Plex Sans SC', 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

/** 全局尺寸（《组件清单.md》）。 */
export const sizing = {
  controlHeight: 34, // 按钮 / 输入 / 筛选 / select
  rowHeight: 44, // 表格行 & 表头
  sidebarWidth: 224,
  topbarHeight: 56,
  radius: 6, // 圆角基数（标签 4、卡片 7）
} as const;

/** 把 palette 映射成 AntD ConfigProvider 主题。状态/分类色不进这里。 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: palette.accent,
    colorLink: palette.accent,
    colorInfo: palette.accent,

    colorBgLayout: palette.canvas,
    colorBgContainer: palette.surface,
    colorBorder: palette.border,
    colorBorderSecondary: palette.hairline,
    colorFillSecondary: palette.fill,
    colorFillTertiary: palette.fill,

    colorText: palette.text,
    colorTextSecondary: palette.sub,
    colorTextTertiary: palette.weak,
    colorTextQuaternary: palette.weak,
    colorTextPlaceholder: palette.weak,

    borderRadius: sizing.radius,
    controlHeight: sizing.controlHeight,
    fontFamily: fonts.body,
    fontFamilyCode: fonts.mono,
    fontSize: 13,
  },
  components: {
    Layout: {
      bodyBg: palette.canvas,
      headerBg: palette.surface,
      siderBg: palette.surface,
      headerHeight: sizing.topbarHeight,
      headerPadding: '0 28px',
    },
    Button: {
      controlHeight: sizing.controlHeight,
      paddingContentHorizontal: 14,
      primaryShadow: 'none',
      defaultShadow: 'none',
      fontWeight: 500,
    },
    Table: {
      headerBg: palette.fill,
      headerColor: palette.weak,
      headerSplitColor: 'transparent',
      borderColor: palette.hairline,
      // 行高 44 ≈ 内容(≈22) + 上下内边距(11×2)；单元格内边距横向 16。
      cellPaddingBlock: 11,
      cellPaddingInline: 16,
      rowHoverBg: palette.fill,
    },
    Card: {
      borderRadiusLG: sizing.radius + 1,
      colorBorderSecondary: palette.hairline,
    },
    Input: { controlHeight: sizing.controlHeight },
    Select: { controlHeight: sizing.controlHeight },
    InputNumber: { controlHeight: sizing.controlHeight },
    // 当前页：实心蓝底 + 白字（白字否则蓝字压在蓝底上看不见）。
    Pagination: {
      itemActiveBg: palette.accent,
      itemActiveColor: '#ffffff',
      itemActiveColorHover: '#ffffff',
    },
    Drawer: { paddingLG: 22 },
  },
};
