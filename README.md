# markflow

[![CI](https://github.com/xilele777/markflow/actions/workflows/ci.yml/badge.svg)](https://github.com/xilele777/markflow/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-5FA04E?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

可自托管的数据标注平台，支持从数据集导入、任务分配到标注、质检与结果导出的完整流程。

[快速开始](#快速开始) · [项目文档](docs/README.md) · [部署指南](docs/server/deployment.md) · [问题反馈](https://github.com/xilele777/markflow/issues)

## 功能

- **团队协作**：工作空间隔离，标注管理员、标注员、审核员角色与权限管理。
- **数据集管理**：JSONL 上传、版本管理、JSON Schema 校验与样本预览。
- **流程编排**：按需组合 AI 预标、人工标注、AI 预审、初检和复检。
- **任务分配**：先到先得或固定比例分配，预派发、超时回收及连续作业。
- **标注与质检**：内置可视化工具和外部 IFRAME 工具，自动保存、审核通过、驳回重标。
- **交付与运维**：JSONL / CSV 结果导出、站内通知、截止提醒、任务暂停与恢复、健康检查和监控指标。

## 快速开始

需要 **Node.js ≥ 22**、npm，以及已启动的 Docker（含 Compose）。以下命令在仓库根目录执行。

```bash
git clone https://github.com/xilele777/markflow.git
cd markflow
npm run setup
```

首次运行时复制后端配置；已有配置请保留：

```bash
# macOS / Linux
cp apps/server/.env.example apps/server/.env
```

```powershell
# Windows PowerShell
Copy-Item apps/server/.env.example apps/server/.env
```

启动 PostgreSQL、Redis、MinIO 和后端：

```bash
npm run infra:up
npm run dev:server
```

另开终端启动前端：

```bash
npm run dev:web
```

访问 **http://localhost:5173**。后端默认监听 `http://127.0.0.1:8080`，前端通过 `/api` 代理访问。后端启动时自动执行数据库迁移和首次管理员初始化。

本地 MinIO 从固定的官方源码提交构建，首次 `infra:up` 需要下载 Go 依赖并编译，耗时较长，后续复用镜像。该社区版本已停止维护，仅作为开发和测试依赖；生产对象存储请按部署指南配置。

示例配置的本地管理员为 `admin` / `admin123456`。首次启动前可在 `apps/server/.env` 修改 `MARKFLOW_ADMIN_USERNAME` 和 `MARKFLOW_ADMIN_INITIAL_PASSWORD`；部署环境需使用自己的密码、JWT 密钥和加密密钥。

首次使用：创建空间 → 添加成员并分配角色 → 创建标注工具 → 上传 JSONL 数据集 → 创建标注任务 → 标注与质检 → 导出结果。AI 阶段需要先配置兼容的模型服务。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React、TypeScript、Vite、Ant Design、TanStack Query、Puck |
| 后端 | Node.js、TypeScript、Express、Kysely |
| 数据与任务 | PostgreSQL、Redis、BullMQ、事务性 outbox |
| 文件存储 | S3 兼容对象存储，本地使用 MinIO |
| 验证 | Vitest、Testing Library、Supertest、Chrome 浏览器验收 |

```text
apps/
  server/           后端服务、数据库迁移、集成测试和运维脚本
  web/              前端应用、组件测试和浏览器验收脚本
docs/               开发、设计、部署与验收文档
tests/              仓库级发布打包测试
.github/workflows/  CI 与可选部署工作流
```

两个应用独立管理依赖和锁文件，根目录提供统一开发命令。

## 开发与测试

| 命令 | 说明 |
|---|---|
| `npm run setup` | 安装两个应用的锁定依赖 |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 发布打包测试、后端集成测试、前端测试 |
| `npm run build` | 生产构建与前端体积预算检查 |
| `npm run test:release` | 单独运行发布打包测试 |
| `npm run package:release` | 将已构建的应用打包到 `artifacts/` |

后端集成测试需要本地基础设施，并会重建专用 `markflow_test` 数据库的 schema；请使用隔离的测试环境。详细步骤见 [后端测试指南](docs/server/testing.md) 和 [前端测试指南](docs/web/testing.md)。

## 项目状态

项目处于持续开发阶段，核心流程与本轮修复已通过本地自动化和浏览器验收，见 [修复验收记录](docs/reviews/2026-09-24-project-review-fixes.md)。生产部署、历史数据迁移及业务切换仍需独立验收。

当前尚未提供数据集 CSV 导入、标注工具编辑、AI 失败后的手动重派、审核意见草稿自动保存，以及完整的审核历史。功能范围和后续事项见 [验收状态](docs/verification.md)。

## 参与贡献

欢迎通过 Issue 提交问题、使用场景或改进建议。报告缺陷时请附复现步骤、预期行为、实际结果和运行环境。

提交 Pull Request 前，请为业务修复补充回归用例，更新相关文档，并运行 `npm run lint`、`npm run typecheck`、`npm test` 和 `npm run build`。后端代码还需通过 `cd apps/server && npx prettier --check src tests`。请勿提交 `.env`、访问密钥、真实业务数据或本地产物。

## 许可证

仓库尚未指定开源许可证；使用与分发授权以维护者明确提供的许可为准。
