# Monorepo 目录与历史

日期：2026-09-22。`F:/label` 现在是唯一 Git 工作树，分支为 `main`。前后端不是子模块，也没有嵌套的活动 Git 仓库。

```text
label/
  .git/                       唯一活动仓库
  .github/workflows/          ci.yml / deploy.yml
  package.json               根命令入口，无运行依赖
  package-lock.json           根入口锁文件，不合并应用依赖
  apps/
    server/
      src/                    app / modules / infra / db
      tests/                  后端单元与集成测试
      scripts/                打包、发布、备份与 API 冒烟
      deploy/                 Compose / PM2 / Nginx / 监控 / systemd
      package.json / package-lock.json
      .env                    本地配置，不入库
    web/
      src/                    app / features / shared / test / types
      public/                 静态资源
      e2e/                    Chrome 浏览器验收
      scripts/                构建预算检查
      examples/               本地 JSONL 样例，不入库
      package.json / package-lock.json
  docs/
    server/                   开发、测试、部署手册
    web/                      规范、接入、测试、历史设计
    plans/                    有效规划
    handoff/                  按时间保留的交接
    reference/                架构、规则与初期评估
    archive/plans/            失效计划
  tests/                      仓库级发布打包测试
  artifacts/                  本地打包目录、归档和 SHA256，不入库
  .migration-backup/          合仓前 Git 元数据和 bundles，不入库
```

## 维护约定

一次业务改动可同时提交前后端与文档。根 `npm run setup` 分别按两份锁文件执行 npm ci；没有依赖提升或 npm workspaces，不引入 Nx / Turbo。各应用仍可独立安装、开发、构建和运行。

全部 GitHub 工作流在根 `.github/workflows/`。统一 CI 分别检查前后端，并执行打包测试和发布脚本夹具。CD 默认关闭，未来只检出一个确定的提交构建两端，发布包的 repository / server / web SHA 相同。Linux release 内部的 `server/`、`web/`、`scripts/` 布局保持不变。

`.env`、node_modules、dist、本地样例、artifacts 和迁移备份不提交。项目文档统一在根 docs；应用 README 仅提供入口，CLAUDE.md 按工具发现规则保留。

## 完整历史如何保留

原仓库最后提交为后端 `afc71f21a22f084a1d49f668555f6804db8518cf`、前端 `5a71ec2db8506b860faf6d39c8c53ecaca815af5`。通过保留双方父提交的合并，把当前源码树导入 apps/server 与 apps/web；没有 squash 或改写旧提交。

- `migration/server-before-monorepo`：原后端最后提交的标签。
- `migration/web-before-monorepo`：原前端最后提交的标签。
- `git log --graph --all --oneline`：查看整体历史。
- `git log migration/server-before-monorepo -- src/main.ts`：按旧路径查原后端历史。
- `git log migration/web-before-monorepo -- src/app/router.tsx`：按旧路径查原前端历史。

历史提交中的文件仍使用当时仓库根路径；合仓后的文件用 apps/ 前缀。原远端配置只留在本机备份，不自动成为新仓库 remote。

## 旧路径对照

| 旧路径 | 当前路径 |
|---|---|
| `lingshu-server/` | `apps/server/` |
| `lingshu-web/` | `apps/web/` |
| `lingshu-server/DEPLOY.md` 或 `lingshu-server/docs/deployment.md` | `docs/server/deployment.md` |
| 原后端长 README 或 `lingshu-server/docs/development.md` | `docs/server/development.md` |
| `lingshu-server/scripts/smoke/README.md` 或 `lingshu-server/docs/testing.md` | `docs/server/testing.md` |
| `lingshu-web/docs/` | `docs/web/` |
| `lingshu-web/e2e/README.md` | `docs/web/testing.md` |
| `lingshu-web/claudeDesign/lingshu/` | `docs/web/design/` |
| 前端根 JSONL 样例 | `apps/web/examples/datasets/` 与 `apps/web/examples/users/` |
| `lingshu-server/artifacts/` | 根 `artifacts/`；旧实验 / 解包目录仍在其 archive/ |
| 根两份早期评估报告 | `docs/reference/` 内同名文件 |
| `docs/plans/0001-*`、`docs/superpowers/plans/*` | `docs/archive/plans/` |
| 两个应用各自的 `.github/workflows/` | 根 `.github/workflows/`，已合并与改写 |

历史 handoff 保留原文，按此映射读取。LabelHub 与 submission 在本轮开始时已不在工作区，本轮未删除、移动或导入它们；历史资料中指向它们的引用仅用于追溯，不代表现存备份位置。

备份目录中的 server.bundle / web.bundle 已通过 git bundle verify，另保留两边完整 `.git` 元数据和根文档迁移前副本；这些仅在本机，不应随新仓库发布。数据卷及应用 .env 随原环境保留，Git 历史备份不能替代数据库和对象存储备份。
