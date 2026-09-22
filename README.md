# 灵枢 LingShu

数据标注平台，采用 **monorepo**：React 前端与 Node.js / TypeScript 后端共享提交历史、文档和 CI，独立管理依赖与构建。

核心流程已通过本地验收，仍有规划差异待收口；M6 部署准备完成，尚未上线、迁移历史数据或切换业务。服务器就绪前不部署，CD 默认关闭。详见 [验收状态](docs/verification.md)。

## 本地启动

需要 Node.js ≥ 22、npm 和 Docker Compose。以下命令在仓库根目录执行：

```bash
npm run setup
# 首次创建配置；已有 .env 时不要覆盖
cp apps/server/.env.example apps/server/.env
npm run infra:up
npm run dev:server
```

另开终端执行 `npm run dev:web`。后端默认 `http://127.0.0.1:8080`，前端 `http://localhost:5173`，前端 `/api` 代理到后端。

| 根目录命令 | 作用 |
|---|---|
| `npm run setup` | 按两份应用锁文件安装依赖 |
| `npm run lint` / `npm run typecheck` | 两个应用的静态检查 |
| `npm test` | 发布打包测试 + 后端集成测试 + 前端测试；需要本地基础设施 |
| `npm run build` | 后端编译 + 前端构建和体积预算 |
| `npm run test:release` | 仅运行独立的打包测试，不依赖数据库 |
| `npm run package:release` | 将已构建的两端组装到根 artifacts/；不连接服务器 |

也可进入 `apps/server/` 或 `apps/web/`，执行该应用原有 npm 命令。根 package.json 只做命令编排，没有 npm workspaces；各应用 package-lock.json 是各自依赖的唯一锁定文件，根锁文件仅对应无依赖的命令入口。

## 目录与文档

```text
label/                       Git 仓库根，main 分支
  apps/server/               后端源码、测试和运行配置
  apps/web/                  前端源码、测试和静态资源
  docs/                      全部项目文档、设计参考和交接
  tests/                     仓库级打包测试
  .github/workflows/         统一 CI 与默认关闭的 CD
  artifacts/                 本地发布产物，不提交
```

- [文档总入口](docs/README.md)
- [后端开发](docs/server/development.md) / [前端规范](docs/web/INDEX.md)
- [部署、备份和回滚](docs/server/deployment.md)
- [目录规范与历史迁移](docs/structure.md)

原前后端完整提交历史已合并，旧提交号保留。GitHub 私有仓库为 [xilele777/lingshu](https://github.com/xilele777/lingshu)，对应 origin；原前端 upstream 不作为新项目推送目标。CI 结果见 [Actions](https://github.com/xilele777/lingshu/actions/workflows/ci.yml)，部署变量 `LINGSHU_DEPLOY_ENABLED=false`。本机原 Git 元数据和 bundle 在被忽略的 `.migration-backup/20260922-monorepo/`，历史已进入新仓库，备份不参与运行。
