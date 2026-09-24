# markflow前端

React 18、TypeScript、Vite 6、Ant Design、TanStack Query、Puck。源码位于 monorepo 的 `apps/web/`，后端在 `../server/`。

Node.js ≥ 22。从仓库根执行 `npm run setup`、`npm run dev:web`；也可进入本目录执行 `npm ci`、`npm run dev`。默认地址 `http://localhost:5173`，`/api` 代理到后端 `http://127.0.0.1:8080`。

本目录常规检查：`npm run lint`、`npm run typecheck`、`npm test`、`npm run build:check`。

- [规范与接入文档](../../docs/web/INDEX.md)
- [浏览器验收](../../docs/web/testing.md)
- [本地样例说明](../../docs/web/examples.md)
- [项目文档总入口](../../docs/README.md)

设计参考统一在根 `docs/web/design/`；本地导入样例在 `examples/`，JSONL 文件仍不入库。核心流程已通过本地验收，全部规划功能和生产切换尚未完成。
