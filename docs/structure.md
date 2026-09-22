# 目录规范与整理记录

日期：2026-09-22。两个应用仓库维持同级位置，现有启动、CI、相邻仓库打包路径保持有效。

```text
label/
  README.md
  docs/
    README.md                 工作区文档索引
    verification.md           验收事实和未完成项
    structure.md              目录规范与路径对照
    plans/                    当前有效计划
    handoff/                  按时间保留的状态快照
    reference/                架构、规则、初期评估
    archive/plans/            已被替代的计划
  lingshu-server/
    README.md
    docs/                     development / testing / deployment
    src/                      app / modules / infra / db
    tests/                    后端自动化测试
    scripts/                  打包、发布、备份、冒烟脚本
    deploy/                   Compose / PM2 / Nginx / 监控 / systemd 配置
    artifacts/                忽略入库的发布包与校验文件
      archive/                旧打包试验和重复解包目录
  lingshu-web/
    README.md / CLAUDE.md      项目入口与工具识别入口
    docs/
      INDEX.md                前端规范索引
      testing.md              浏览器验收
      examples.md             本地样例说明
      standards/              前端规范
      design/                 历史设计原型、截图与交接资料
    src/                      app / features / shared / test / types
    public/                   静态资源
    e2e/                      浏览器验收脚本
    scripts/                  构建门禁
    examples/                 datasets / users，本地 JSONL 文件不入库
  LabelHub/                   旧系统，完整保留
  submission/                 原始交付规格与参考资料，完整保留
```

仓库根还保留工具要求的 package.json、锁文件、TypeScript / Vite / ESLint 配置、`.github/` 等，避免为追求层级而改变工具发现规则。`.env`、本地依赖、现用 dist 和数据库卷保留；不在目录整理时重置环境或删除业务数据。

## 旧路径对照

以下均相对于工作区根目录；旧快照中的路径按此查找。

| 原路径 | 新路径 |
|---|---|
| `灵枢迁移报告与总体计划.md` | `docs/reference/灵枢迁移报告与总体计划.md` |
| `项目质量分析与迁移评估.md` | `docs/reference/项目质量分析与迁移评估.md` |
| `docs/plans/0001-*.md` | `docs/archive/plans/0001-*.md` |
| `docs/superpowers/plans/2026-09-22-lingshu-migration-phase1-reproducible-and-secure.md` | `docs/archive/plans/2026-09-22-lingshu-migration-phase1-reproducible-and-secure.md` |
| 原后端长篇 `lingshu-server/README.md` | `lingshu-server/docs/development.md`；根 README 改为简短入口 |
| `lingshu-server/DEPLOY.md` | `lingshu-server/docs/deployment.md` |
| `lingshu-server/scripts/smoke/README.md` | `lingshu-server/docs/testing.md` |
| `lingshu-web/e2e/README.md` | `lingshu-web/docs/testing.md` |
| `lingshu-web/claudeDesign/lingshu/` | `lingshu-web/docs/design/` |
| `lingshu-web/` 根下三个数据集 JSONL | `lingshu-web/examples/datasets/` |
| `lingshu-web/import-users-30.jsonl` | `lingshu-web/examples/users/import-users-30.jsonl` |
| `lingshu-server/artifacts/m6-local-validation/` | `lingshu-server/artifacts/archive/m6-local-validation/` |
| `lingshu-server/artifacts/m6-ready-20260922/` | `lingshu-server/artifacts/archive/m6-ready-20260922/` |

## 清理与保留

- 删除无引用的 `src/app/layout/PagePlaceholder.tsx`，包括两个旧占位组件；现有路由不依赖它们。
- 移除前端 `.prettierignore` 失效的 `claudeDesign` 项；新设计路径已被既有 `docs` 规则覆盖。
- 两个生成物目录原计划删除；自动审批返回 `blocked by policy`，因此改为可逆归档，未删除。移动前已逐文件核对正式解包目录与压缩包，357 文件完全一致。
- 正式 `.tar.gz` 和 `.sha256` 留在 artifacts 顶层；打包脚本和 CI 路径不变。归档目录不作为新的候选版本。
- 文档移动后修复当前链接，历史 handoff 不改写。迁移留下的空父目录可能仍在本机，不包含内容，也不进入 Git。
- LabelHub 与 submission 仍有规格与回退价值，不属于当前可删垃圾；未移动、未封存。

工作区根不在 Git 中；应备份根 README、根 docs、被忽略的本地样例和发布包。仓库专属文档留在各自 Git 中，不建立需要管理员权限的跨仓库软链接。
