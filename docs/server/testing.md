# 后端测试与接口冒烟

所有命令在 `apps/server/` 应用目录执行。

单元与集成测试：`npm test`（连接真实 PostgreSQL / Redis / S3 测试环境，重建专用测试库；环境配置见 [开发指南](development.md)）。常规检查为 `npm run lint`、`npm run typecheck`、`npm run build`。

部署脚本夹具为 `bash scripts/test-activate.sh`，在 Linux 环境运行，模拟 PM2/npm；生产验收步骤见 [部署手册](deployment.md)。

## 接口级冒烟

对**运行中**的后端（默认 `http://127.0.0.1:8080`）按里程碑跑一遍真实接口，输出每步 status / code / 是否符合预期。
不依赖第三方库（Node ≥ 22），不连数据库；每次运行用时间戳后缀造新数据，不清理（`npm run infra:reset` 可全清）。

| 脚本           | 覆盖                                                                        | 用法                                        |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| `smoke-m1.mjs` | workspace / user / labeltool / aiconfig / contribution                      | `node scripts/smoke/smoke-m1.mjs [baseUrl]` |
| `smoke-m2.mjs` | dataset 六接口 + 预签名直传 MinIO + 异步解析                                | `node scripts/smoke/smoke-m2.mjs [baseUrl]` |
| `smoke-m3.mjs` | case / task / taskgroup + 派发 + 驳回重标 + AI 预标预审（本地假 LLM）+ 导出 | `node scripts/smoke/smoke-m3.mjs [baseUrl]` |

系统管理员账号默认 `admin / admin123456`（与 `.env` 首启引导一致），可用环境变量 `MARKFLOW_ADMIN_USERNAME` / `MARKFLOW_ADMIN_INITIAL_PASSWORD` 覆盖。

`smoke-m3.mjs` 会在本机起一个假 OpenAI 兼容服务供 AI 阶段调用，需要后端能访问 `127.0.0.1` 上的随机端口。

与 `npm test`（vitest + supertest 连测试库）的区别：这里打的是开发库与真实进程，用于部署后 / 改 `.env` 后的快速验证。
