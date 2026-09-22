# 灵枢文档总入口

先读[验收状态](verification.md)，再读[当前迁移规划](plans/0002-2026-09-22-规划-迁移总规划.md)。最新交接为 [0011 · 目录整理与验收边界](handoff/0011-2026-09-22-状态快照-目录整理与验收边界.md)。

## 当前文档

| 内容 | 入口 |
|---|---|
| 已验证范围、未完成事项 | [verification.md](verification.md) |
| 目录层级、清理规则与旧路径对照 | [structure.md](structure.md) |
| 当前迁移总规划 | [规划 0002](plans/0002-2026-09-22-规划-迁移总规划.md) |
| 后端开发、接口与配置 | [后端开发指南](../lingshu-server/docs/development.md) |
| 服务器准备、部署、回滚、备份、切换 | [部署手册](../lingshu-server/docs/deployment.md) |
| 后端接口冒烟 | [后端测试指南](../lingshu-server/docs/testing.md) |
| 前端规范、第三方工具接入 | [前端文档索引](../lingshu-web/docs/INDEX.md) |
| Chrome 浏览器验收 | [前端测试指南](../lingshu-web/docs/testing.md) |
| 本地样例位置与用途 | [前端样例说明](../lingshu-web/docs/examples.md) |

## 资料层级

- `plans/`：当前有效的迁移计划。
- `handoff/`：按时间保留的里程碑快照。旧快照反映当时状态，当前结论以最新快照为准；历史路径对应关系见 structure.md。
- `reference/`：架构索引、派发规则、初期评估与迁移报告。初期报告中的 Java 实施路线已被 TS 方案替代。
- `archive/plans/`：已被替代的计划，仅保留决策历史，不作为当前执行指令。

根 `docs/` 负责跨仓库资料；仓库专属文档放在各自 `docs/`，以便单独检出仓库时仍有开发、测试和部署说明。仓库根仅保留 README 和工具识别用的 CLAUDE.md。
