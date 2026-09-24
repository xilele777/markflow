# markflow后端

Node.js ≥ 22、TypeScript、Express、PostgreSQL、Redis / BullMQ、S3 兼容对象存储。源码位于 monorepo 的 `apps/server/`，前端在 `../web/`。

从仓库根执行 `npm run setup`、`npm run infra:up`、`npm run dev:server`；首次先从本目录 `.env.example` 创建 `.env`。也可进入本目录执行原有 npm 命令，API 默认 `http://127.0.0.1:8080`。

- [开发、接口、配置与代码结构](../../docs/server/development.md)
- [测试与接口冒烟](../../docs/server/testing.md)
- [部署、回滚、备份和切换](../../docs/server/deployment.md)
- [项目文档总入口](../../docs/README.md)

核心流程已通过本地验收，数据集 CSV 导入、标注工具更新及可选项仍待完成。M6 仅部署准备完成，未上线，CD 默认关闭。发布产物统一输出到仓库根 `artifacts/`。
