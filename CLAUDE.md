# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目身份

灵枢前端（LingShu Web）= 灵枢数据生产与协同平台的 Web 前端，面向管理与标注 / 质检两类使用场景。
后端是同一工作区的 `../lingshu-server`（Node + TS 重写，接口契约与本前端 `src/features/*/api.ts` 严格一致）；跨仓库的规划与交接文档在 `../docs/`（`plans/`、`handoff/`、`reference/`，只增不改）。

## 技术栈（已定）

React 18 + TypeScript + Vite 6 + Ant Design 5；路由 react-router-dom 6（`createBrowserRouter`，页面按路由 `React.lazy`）；数据层 TanStack Query 5；客户端态 Zustand 5（`shared/store/auth`、`workspace`）；HTTP axios 单例（`shared/api/http.ts`，拆包络 / 注入 Bearer / 401 跳登录）；内置标注工具用 @measured/puck 0.20（`features/labeltool/puck`）；性能上报 web-vitals；测试 vitest + Testing Library + happy-dom。

## 常用命令

```bash
npm run dev          # Vite 5173，/api 代理到 127.0.0.1:8080
npm run lint         # eslint .（错误必须为 0）
npm run typecheck    # tsc --noEmit
npm test             # vitest run（src/**/*.{test,spec}.{ts,tsx}）
npm run build        # tsc + vite build
npm run build:check  # build + scripts/check-bundle-size.cjs（入口 gzip 预算门禁）
node e2e/e2e-m4.mjs  # 无头 Chrome 浏览器验收（需前后端都在跑，见 docs/testing.md）
```

lint / typecheck / test / build 是每次改动后的常规验证动作，直接执行即可。

## 设计纪律（动手前必读）

- 颜色只用 `src/app/theme.ts` 的 `palette` 与 `src/shared/constants/tones.ts` 的语义色，禁止硬编码色值（ESLint 有 warn）；外壳永远中性，颜色只表达「状态」「分类」。
- 用 AntD 组件 + 主题 token 出外观，不手搓 CSS override。
- 页面只从 `src/shared/components` 取封装组件拼装（`DataTable` / `Btn` / `Tag` / `Drawer` / `Modal` / `toast` …）；新页面照 `docs/standards/页面模板.md` 对号入座；状态 / 文案以 `状态映射.md` / `文案规范.md` 为准。
- 视觉方向：工坊·浅色（中性外壳 + 强调蓝 + IBM Plex），详见 `docs/standards/配色规范.md`。

## 目录约定

- `src/app/`：`router.tsx`（路由表 + 懒加载）、`layout/`（AppShell / Sidebar / nav.ts 菜单 / RequireAuth / RequireRole）、`theme.ts`。
- `src/features/<模块>/`：`api.ts`（typed 接口函数，函数名与后端接口同名）、`types.ts`、`pages/`、`components/`。模块：auth、dataset、case、taskgroup、task、exec（执行页 + 嵌入页）、labeltool（含 puck）、aiconfig、workspace、user、contribution、monitoring、notification（通知铃铛 + 通知中心）、external（IFRAME 工具示范）。
- `src/shared/`：`api/`、`auth/permissions.ts`（角色派生能力，纯函数 `computeRoles` / `pickHomePath`）、`store/`、`components/`、`constants/`、`hooks/`、`monitoring/webVitals.ts`、`utils/`。
- 测试文件与源码同目录（`*.test.ts(x)`）；`src/test/setup.ts` 是 vitest 全局 setup。
- `e2e/`：无头 Chrome + CDP 验收脚本；`scripts/`：构建门禁脚本。

## 协作流程

- 按里程碑推进（见 `../docs/plans/0002-*`），每个里程碑结束：测试全绿 → Conventional Commits 提交（不 push）→ 新增 `../docs/handoff/NNNN-*` 快照。
- 不明确处先问；接口字段以后端 `../lingshu-server/src/modules/*/` 路由与本仓库 `api.ts` 为准，不凭记忆猜。
- 未经用户明确同意不 `git push`；提交前展示 commit message。

## 文档按需加载

先查 `docs/INDEX.md`：

- 写页面前 → `docs/standards/组件清单.md`、`页面模板.md`
- 带颜色 / 状态标签 → `配色规范.md`、`状态映射.md`
- 左侧导航 → `菜单栏.md`；界面文字 → `文案规范.md`
- 调后端 → `接口层.md`；菜单 / 路由显隐 → `权限可见性.md`
- 外部标注工具接入 → `docs/external-tool-integration.md`
