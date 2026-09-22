# 灵枢 LingShu · 后端（Node + TypeScript）

灵枢数据标注平台后端的 TS 重写，接口契约与灵枢 React 前端（`../web`）严格一致。规格来源与里程碑见 [项目文档入口](../README.md)（`plans/0002-*` 为当前规划，`reference/0002-*` 为 Java 后端索引，`handoff/` 最新一篇为当前状态）。

M6 部署准备、生产配置、发布/回滚、备份恢复与切换验收见 [部署手册](deployment.md)。当前没有部署服务器，CD 默认关闭。

本文应用命令与代码路径均相对于 `apps/server/`；前端为同级 `../web/`。仓库根统一命令见 [README](../../README.md)。

## 5 分钟起步

前置：Node ≥ 22、Docker Desktop（Compose v2）。

```bash
cp .env.example .env          # 本地口令仅供开发
npm install
npm run infra:up              # 起 PostgreSQL 16 / Redis 7 / MinIO（首次会拉镜像）
npm run dev                   # 自动迁移 → 首启引导（写 jwt.* 与 admin）→ 监听 8080
```

验证：

```bash
curl -s http://127.0.0.1:8080/api/health
curl -s -X POST http://127.0.0.1:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123456"}'
curl -s http://127.0.0.1:8080/api/user/getCurrentUser -H "Authorization: Bearer <token>"
```

前端：`../web` 执行 `npm run dev`，Vite 已把 `/api` 代理到 `127.0.0.1:8080`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | tsx watch 启动 |
| `npm test` | vitest + supertest，连真实 pg/redis，库为 `lingshu_test`（每次重建） |
| `npm run typecheck` / `npm run lint` | tsc / eslint |
| `npm run build` && `npm start` | 编译到 `dist/` 并以 node 运行 |
| `npm run migrate` | 单独执行迁移（启动时也会自动执行） |
| `npm run infra:up` / `infra:down` / `infra:reset` | 中间件容器启停；`reset` 会删数据卷 |

## 已实现接口

| 模块 | 端点（均在 `/api` 下；health / 登录 / 性能上报公开，metrics 独立 token，其余需 `Authorization: Bearer <jwt>`） |
|---|---|
| health | `GET /health`（公开；PG / Redis / 对象存储 / 队列 readiness） |
| metrics | `GET /metrics`（Prometheus 文本；独立 `LINGSHU_METRICS_TOKEN`，未配置 404） |
| auth | `POST /auth/login` |
| user | `POST /user/create`、`getUserList`、`GET /user/getCurrentUser`、`POST /user/changePassword`、`updateStatus`（禁用 / 启用）、`getMyContribution` |
| workspace | `POST /workspace/createWorkspace`、`getWorkspaceList`、`addWorkspaceMember`、`getWorkspaceDetail` |
| labeltool | `POST /labeltool/createLabelTool`、`getLabelToolList`、`getLabelToolDetail` |
| aiconfig | `POST /aiconfig/createAiConfig`、`updateAiConfig`、`getAiConfigList` |
| dataset | `POST /dataset/getUploadPreSignedUrl`、`createDataset`、`createDatasetVersion`、`getDatasetList`、`getDatasetDetail`、`getVersionSamplePreview` |
| case | `POST /case/createCase`、`getCaseList`、`getCaseDetail`、`exportCaseResult`、`updateCaseStatus`（暂停 / 恢复 / 结束）、`updateCaseDeadline` |
| task | `POST /task/getTaskListInGroup`、`getTaskDetail`、`getSampleData`、`getTaskResult`、`saveTaskResult`、`submitLabelTask`、`submitReviewTask` |
| taskgroup | `POST /taskgroup/getMyTaskGroups`、`getTaskGroupList` |
| notification | `POST /notification/getUnreadCount`、`getNotificationList`、`markRead`（只作用于本人） |
| monitoring | `POST /monitoring/reportWebVitals`（公开、限流）、`getWebVitalsSummary`（系统管理员） |

入参出参与权限规则见 `../../docs/reference/0002-*` §3、派发 / 提交规则见 `../../docs/reference/0004-*`。

定时器（与 API 同进程，Redis 锁保证多实例只跑一份）：任务自动回收（每分钟）、case 截止扫描（每分钟：截止前 24h 提醒一次、逾期通知一次）、outbox 重投（30s）。

数据集上传链路：前端 `getUploadPreSignedUrl` 取预签名 PUT URL → 浏览器直传对象存储（不经后端）→ `createDataset` / `createDatasetVersion` 落库并向 BullMQ `dataset-parse` 队列投递 `{versionId}` → 同进程的消费者从对象存储流式读取 jsonl，按标注工具的 JSON Schema 逐行校验，每 1000 行一批写入 `lingshu_dataset_sample`，最后回写 `upload_status`（2 就绪 / 3 解析失败）与 `ext` 统计（总行数、成功、跳过、前 100 条错误明细或整体失败原因）。

## 配置

全部来自环境变量（启动时读应用目录 `apps/server/.env`，已存在的进程变量优先），清单与说明见 `.env.example`。口令无默认值，缺失即退出。

- 首启引导（幂等）：`sys_config` 缺 `jwt.secret` / `jwt.expireSeconds` 时从 `LINGSHU_JWT_SECRET` / `LINGSHU_JWT_EXPIRE_SECONDS` 写入；`LINGSHU_ADMIN_USERNAME`（默认 `admin`）不存在时用 `LINGSHU_ADMIN_INITIAL_PASSWORD` 创建。已有记录不会被修改。
- `LINGSHU_CONFIG_ENC_KEY`：AI 配置的 apiKey 以 AES-256-GCM 加密后存入 `sys_config[ai.configList]`（密文形如 `enc:v1:…`；无前缀的历史明文可读、下次写入时自动加密）。更换密钥后历史密文无法解密。
- `LINGSHU_TIMEZONE`：「我的贡献」按天统计与上传对象 key 日期段使用的 IANA 时区，默认 `Asia/Shanghai`。
- `LINGSHU_S3_*`：S3 兼容对象存储（本地 MinIO；线上 MinIO 或火山 TOS 的 S3 端点）。`LINGSHU_S3_ENDPOINT` 供后端进程访问；`LINGSHU_S3_PUBLIC_ENDPOINT` 是浏览器直传时实际访问的地址，预签名 URL 以它签名（缺省同 ENDPOINT）；MinIO 需 `LINGSHU_S3_FORCE_PATH_STYLE=true`。compose 里的 MinIO 用 `LINGSHU_CORS_ALLOWED_ORIGINS` 作为 CORS 放行来源。
- `LINGSHU_QUEUE_PREFIX`：BullMQ 在 Redis 中的键前缀（默认 `lingshu`，测试用 `lingshu_test`）。
- `LINGSHU_SERVER_HOST`：默认 `127.0.0.1`，同机 Nginx 反代；容器内运行 API 时按网络模型改为 `0.0.0.0`。
- `LINGSHU_METRICS_TOKEN`：可选，至少 32 字符；抓取时使用 Bearer token，与登录 JWT 无关。生产 Nginx 禁止公网访问 metrics。

## 约定

- 响应包络 `{success, code, message, data, timestamp}`；分页顶层加 `total/pageNum/pageSize`。成功 `code` 为 `SUCCESS`。
- 错误码字符串沿用 Java 各 `*ErrorCode` 枚举名。HTTP 状态：`UNAUTHORIZED` 401、`FORBIDDEN`/`PERMISSION_DENIED` 403、`TOO_MANY_REQUESTS` 429，其余 200。
- 时间戳全部毫秒 number；枚举走 number code；jsonb 列写入时 `JSON.stringify`。
- 用作查找键的字符串列（username、space_code、各 `*_code`、dataset_name、case name、annotator、config_key）为 PostgreSQL `citext`，等值比较大小写不敏感，复刻原 MySQL `utf8mb4_general_ci` 语义；模糊搜索用 `ILIKE` 并转义通配符。
- 分页：pageNum 默认 1（<1 → PARAM_INVALID），pageSize 默认 20、范围 1-100；排序 create_time、id 降序（`src/modules/common/pagination.ts`）。
- 写路径并发：Redis 锁（`src/infra/lock.ts`，键 `lock:<name>`，wait 3s / lease 10s）+ 数据库唯一约束双保险；拿不到锁抛各模块 `OPERATION_CONFLICT`。
- 权限判定集中在 `src/modules/common/permission.ts`（按库实时查，不信任 token）：系统管理员、空间 LABEL_ADMIN、任意空间 LABEL_ADMIN 及其组合。
- 路由层 zod 只约束 JSON 类型（错类型 → PARAM_INVALID），空值与业务规则在服务层判断并返回 Java 同款错误码与文案。
- 异步任务走 BullMQ（`src/infra/queue.ts`）：生产者在事务提交后入队；消费者与 API 同进程（`src/app/workers.ts`），关停时先等在手任务完成。业务级失败（如文件解析失败）在消费者内部落库消化，只有基础设施异常才让 job 失败并重试 3 次。
- 打日志时把异常放在 `err` 字段（`logger.error({ err }, 'msg')`）；序列化器带兜底，日志永远不会打断业务流程。

## 目录

```
src/
  main.ts            进程入口：env → 配置 → 连接 → 迁移 → 引导 → 监听 → 启动队列消费者
  app/               Express 装配、上下文、消费者装配、中间件（鉴权 / 错误处理 / 限流 / 校验 / 请求日志）
  infra/             配置、日志、错误码、包络、db、redis、jwt、bcrypt、sys_config、首启引导、
                     Redis 锁、AES-GCM 加密盒、JSON Schema 编译、S3 对象存储、BullMQ 队列
  db/                Kysely 表类型、迁移（静态注册）、migrate CLI
  modules/common/    分页、字符串、zod 片段、操作者类型、权限判定
  modules/<domain>/  路由 + 服务 + 仓储 + 枚举 + 错误码
                     （auth / user / workspace / labeltool / aiconfig / dataset(含解析服务与消费者) /
                      task(case / task / taskgroup / 派发引擎 / AI 执行器 / 导出 / 消费者与定时器) /
                      notification / monitoring / health）
tests/               vitest + supertest；global-setup 重建 lingshu_test 并清测试队列；helpers/ 造数据
deploy/              docker-compose.yml（pg / redis / minio）
```
