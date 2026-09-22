# 灵枢前端 · 文档索引

> 前端开发文档总目录。**按需加载**：动手前先在此找到对应文档并阅读，不要凭记忆猜。
> 跨仓库资料见 [工作区文档入口](../../docs/README.md)，后端见 [后端 README](../../lingshu-server/README.md)。除 Markdown 链接外，下文代码和命令路径均相对于前端仓库根目录。

## 规范类 `docs/standards/`（编码时按需必读）

| 文档 | 路径 | 作用 | 何时必读 |
|---|---|---|---|
| 配色规范 | standards/配色规范.md | 工坊·浅色：中性外壳 + 强调蓝 + IBM Plex + 状态/分类色板 token | 写任何带颜色的 UI 前 |
| 菜单栏 | standards/菜单栏.md | 侧栏三段结构、纯文字平铺 + 灰字分组 + 蓝 accent bar、底部空间切换 | 实现 / 调整左侧导航前（代码：`src/app/layout/nav.ts`） |
| 组件清单 | standards/组件清单.md | 全站唯一组件库 + 全局尺寸 + AntD 落地映射 | 写任何页面前（代码：`src/shared/components`） |
| 页面模板 | standards/页面模板.md | 列表 / 详情 / 表单 / 执行 四种模板 + 弹窗·抽屉·独立页选择 | 新建任何页面前 |
| 状态映射 | standards/状态映射.md | 各业务枚举 → 颜色 / 文案 的唯一真源 | 渲染状态 / 类型标签前（代码：`src/shared/constants`） |
| 文案规范 | standards/文案规范.md | 界面文字铁律 | 写界面文字前 |
| 工程结构 | standards/工程结构.md | 技术选型、目录结构、命名、路由地图、主题落地 | 搭骨架 / 建目录 / 配路由前 |
| 接口层 | standards/接口层.md | http 客户端、响应包络拆包、鉴权、与 react-query 配合 | 写任何调后端的代码前（代码：`src/shared/api/http.ts`） |
| 权限可见性 | standards/权限可见性.md | 角色 → 菜单 / 操作 显隐 | 配菜单显隐 / 路由守卫前（代码：`src/shared/auth/permissions.ts`） |

注：规范文档写于设计阶段，个别细节已被代码取代（如后端角色 code 为 `LABELER / REVIEWER / LABEL_ADMIN` 英文串；HTTP 状态 401/403/429 非 200）。冲突时以代码与 `../../docs/handoff/` 最新快照为准。

## 接入类（给业务方 / 第三方）

| 文档 | 路径 | 作用 | 何时必读 |
|---|---|---|---|
| 外部标注工具接入 | external-tool-integration.md | IFRAME 接入约定 + URL 参数 + 三个接口 + 内置「情绪判断」示范页 | 业务方自研标注工具 / 注册 IFRAME 类型工具前 |

## 工程与验收

| 内容 | 路径 | 说明 |
|---|---|---|
| 单元 / 组件测试 | `vitest.config.ts`、`src/test/setup.ts`、`src/**/*.test.ts(x)` | `npm test`；覆盖 permissions / nav / http / LoginPage / webVitals / NetworkStatusBar / resultValidation |
| 体积预算门禁 | `scripts/check-bundle-size.cjs` | `npm run build:check`；入口预加载 gzip 与最大单 chunk 预算，CI 执行 |
| 浏览器验收 | [浏览器验收说明](testing.md)、`e2e/e2e-m*.mjs`、`e2e/lib/cdp.mjs` | 无头 Chrome + CDP，按里程碑跑真实前后端 |
| CI | `.github/workflows/ci.yml` | lint / typecheck / test / build + 体积门禁 |
| 前端性能监控 | `src/shared/monitoring/webVitals.ts`、`src/features/monitoring/` | 生产构建上报 Core Web Vitals 到后端；系统管理员在「系统 → 前端性能」看汇总 |

## 设计参考

| 内容 | 路径 | 说明 |
|---|---|---|
| 设计原型 | docs/design/project/ | 视觉目标（JSX / HTML），**不照搬其手写结构** |

## 内置标注工具（Puck）

已实现：`src/features/labeltool/puck/`（`config.tsx` 组件库、`LabelToolRenderer.tsx` 渲染端、`runtime.tsx` 样本 / 结果绑定、`components/*` 展示 / 输入 / 布局组件）。创建入口 `/labeltool/new`；执行页通过 `/embed/label/:taskId` 在 iframe 内渲染，编辑后 debounce 自动保存，提交前按 pageSchema 派生的必填字段做客户端校验（`src/features/exec/resultValidation.ts`）。
