# 灵枢前端

React 18、TypeScript、Vite 6、Ant Design、TanStack Query、Puck。

后端位于同级 `lingshu-server/`；核心业务流程已通过本地验收，生产部署与切换尚未完成。当前数据集导入仅支持 JSONL，标注工具尚无更新入口。

## 本地启动

Node.js ≥ 22，在本仓库根目录执行：

```bash
npm ci
npm run dev
```

默认地址 `http://localhost:5173`，`/api` 代理到 `http://127.0.0.1:8080`。

常规检查：`npm run lint`、`npm run typecheck`、`npm test`、`npm run build:check`。

## 文档与目录

- [规范与接入文档索引](docs/INDEX.md)
- [浏览器验收](docs/testing.md)
- [本地样例说明](docs/examples.md)
- [工作区文档总入口](../docs/README.md)（需要完整工作区）

`src/` 放业务代码和单元测试，`public/` 放公共静态资源，`e2e/` 放浏览器脚本，`scripts/` 放构建检查，`docs/design/` 保存历史设计原型，`examples/` 收纳本地导入样例。`dist/`、`node_modules/` 和本地 JSONL 样例不提交到 Git。
