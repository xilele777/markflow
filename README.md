# 灵枢后端

Node.js ≥ 22、TypeScript、Express、PostgreSQL、Redis / BullMQ、S3 兼容对象存储。

M0–M5 核心流程已完成本地验收；M6 已完成部署准备，实机上线和业务切换待验收，CD 默认关闭。

当前数据集导入仅支持 JSONL；标注工具更新、规则预审和审核历史尚未实现。

## 本地启动

在本仓库根目录执行（需要 Docker Compose）：

```bash
cp .env.example .env
npm ci
npm run infra:up
npm run dev
```

环境变量说明见 `.env.example`，启动自动执行迁移与首启引导；API 默认 `http://127.0.0.1:8080`。

## 文档

- [开发、接口、配置与代码结构](docs/development.md)
- [测试与接口冒烟](docs/testing.md)
- [部署、回滚、备份和切换](docs/deployment.md)
- [工作区文档总入口](../docs/README.md)（需要完整工作区）

`src/` 放业务代码，`tests/` 放自动化测试，`scripts/` 放执行脚本，`deploy/` 放运行配置，`docs/` 放说明。`dist/`、`node_modules/`、`artifacts/` 是本地生成物，不提交到 Git。
