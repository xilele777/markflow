# 灵枢文档总入口

先读 [验收状态](verification.md)，再读 [当前迁移规划](plans/0002-2026-09-22-规划-迁移总规划.md)。最新交接为 [0013 · GitHub 仓库建立](handoff/0013-2026-09-22-状态快照-GitHub仓库建立.md)。

## 当前文档

| 内容 | 入口 |
|---|---|
| 已验证范围、未完成事项 | [verification.md](verification.md) |
| 目录层级、命令约定和历史查询 | [structure.md](structure.md) |
| 当前迁移总规划 | [规划 0002](plans/0002-2026-09-22-规划-迁移总规划.md) |
| 后端开发、接口与配置 | [后端开发指南](server/development.md) |
| 服务器准备、部署、回滚、备份、切换 | [部署手册](server/deployment.md) |
| 后端接口冒烟 | [后端测试指南](server/testing.md) |
| 前端规范、第三方工具接入 | [前端文档索引](web/INDEX.md) |
| Chrome 浏览器验收 | [前端测试指南](web/testing.md) |
| 本地样例位置与用途 | [前端样例说明](web/examples.md) |

## 资料层级

- `server/`：后端开发、测试、运维说明。普通代码路径与应用命令相对于 `apps/server/`，另有标注除外。
- `web/`：前端规范、测试、接入说明；`web/design/` 为历史设计资料。普通代码路径与应用命令相对于 `apps/web/`，另有标注除外。
- `plans/`：当前有效的迁移计划。
- `handoff/`：里程碑历史快照。旧快照的路径、分支和部署状态反映当时事实，以最新快照为当前结论。
- `reference/`：架构索引、派发规则、初期评估。早期报告中的 Java 路线已被 TS 方案替代；其中原交付源码 / LabelHub 路径不属于当前 monorepo，也不保证本机仍可访问。
- `archive/plans/`：已被替代的计划，仅作历史追溯。

所有文档现在都由根 Git 仓库跟踪。应用目录仅保留简短 README 与工具识别文件；旧路径对照见 structure.md。历史快照不批量改写，避免把过去的双仓库状态误记为当时已合仓。
