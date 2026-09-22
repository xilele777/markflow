# 灵枢 LingShu · 后端（Node + TypeScript）

灵枢数据标注平台后端的 TS 重写，接口契约与灵枢 React 前端（`../lingshu-web`）严格一致。规格来源与里程碑见 `../docs/`（`plans/0002-*` 为当前规划，`reference/0002-*` 为 Java 后端索引）。

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

前端：`../lingshu-web` 执行 `npm run dev`，Vite 已把 `/api` 代理到 `127.0.0.1:8080`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | tsx watch 启动 |
| `npm test` | vitest + supertest，连真实 pg/redis，库为 `lingshu_test`（每次重建） |
| `npm run typecheck` / `npm run lint` | tsc / eslint |
| `npm run build` && `npm start` | 编译到 `dist/` 并以 node 运行 |
| `npm run migrate` | 单独执行迁移（启动时也会自动执行） |
| `npm run infra:up` / `infra:down` / `infra:reset` | 中间件容器启停；`reset` 会删数据卷 |

## 配置

全部来自环境变量（启动时读仓库根 `.env`，已存在的进程变量优先），清单与说明见 `.env.example`。口令无默认值，缺失即退出。

首启引导（幂等）：`sys_config` 缺 `jwt.secret` / `jwt.expireSeconds` 时从 `LINGSHU_JWT_SECRET` / `LINGSHU_JWT_EXPIRE_SECONDS` 写入；`LINGSHU_ADMIN_USERNAME`（默认 `admin`）不存在时用 `LINGSHU_ADMIN_INITIAL_PASSWORD` 创建。已有记录不会被修改。

## 约定

- 响应包络 `{success, code, message, data, timestamp}`；分页顶层加 `total/pageNum/pageSize`。成功 `code` 为 `SUCCESS`。
- 错误码字符串沿用 Java 各 `*ErrorCode` 枚举名。HTTP 状态：`UNAUTHORIZED` 401、`FORBIDDEN`/`PERMISSION_DENIED` 403、`TOO_MANY_REQUESTS` 429，其余 200。
- 时间戳全部毫秒 number；枚举走 number code；jsonb 列写入时 `JSON.stringify`。
- 用作查找键的字符串列（username、space_code、各 `*_code`、dataset_name、case name、annotator、config_key）为 PostgreSQL `citext`，等值比较大小写不敏感，复刻原 MySQL `utf8mb4_general_ci` 语义。

## 目录

```
src/
  main.ts            进程入口：env → 配置 → 连接 → 迁移 → 引导 → 监听
  app/               Express 装配、上下文、中间件（鉴权 / 错误处理 / 限流 / 校验 / 请求日志）
  infra/             配置、日志、错误码、包络、db、redis、jwt、bcrypt、sys_config、首启引导
  db/                Kysely 表类型、迁移（静态注册）、migrate CLI
  modules/<domain>/  路由 + 服务 + 仓储 + 枚举 + 错误码（auth / user / workspace / health）
tests/               vitest + supertest；global-setup 重建 lingshu_test
deploy/              docker-compose.yml（pg / redis / minio）
```
