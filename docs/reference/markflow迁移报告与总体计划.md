> 早期评估资料：Java 实施路线已被 TS 迁移规划替代，当前状态见 [验收状态](../verification.md)。文中普通代码路径沿用工作区根目录。

# markflow 迁移报告与总体计划

> 编写日期：2026-09-22
> 基础文档：`项目质量分析与迁移评估.md`（2026-09-21，双项目质量对比与迁移方向评估）
> 本文性质：**决策与路线图文档**。逐步可执行的计划另见 `docs/superpowers/plans/` 下的分阶段计划文件（阶段 1、阶段 2 已写出；阶段 3、4 在前序阶段完成后编写）。
> 所有事实均来自对 `F:/label/submission/`（markflow两仓）与 `F:/label/LabelHub/` 源码、配置、git 历史的直接读取，关键处标注了文件路径。

---

## 目录

1. 决策摘要
2. 前提与授权
3. 迁移范围定义（三张清单）
4. 功能差距矩阵：LabelHub → markflow
5. 工程差距矩阵：markflow当前状态 vs 目标状态
6. 目标架构与仓库布局
7. 关键技术决策（ADR）
8. 分阶段路线图与工作量
9. 风险登记册
10. 切换（Cutover）与回退策略
11. 总体验收标准
12. 附录 A：反推的数据库表结构
13. 附录 B：环境变量与 sys_config 键清单
14. 附录 C：本机环境检查结果
15. 附录 D：迁移中发现的markflow隐藏问题

---

## 1. 决策摘要

**决策：以markflow（markflow）为基座，把 LabelHub 的工程能力与少量业务功能移植到markflow上；LabelHub 转入维护状态，不再新增功能。**

理由（详见前一份评估报告 §7）：

- 迁移成本不对称。把markflow的"多池派发引擎 + 数据资产层 + MQ + 多租户"搬进 LabelHub 等于重写 LabelHub 后端核心；把 LabelHub 的 CI/CD、安全加固、测试、性能治理搬进markflow是纯加法，不动markflow架构。
- markflow的业务模型天花板远高于 LabelHub（AI 原生、流程可编排、流式接入、多租户）。
- LabelHub 的线上数据极小（users 3 / tasks 12 / annotation_items 19，见 `LabelHub/DEPLOY.md` §五基线），无需做数据迁移。

**迁移的核心目标（按优先级）：**

| # | 目标 | 当前状态 | 衡量标准 |
|---|---|---|---|
| G1 | markflow**可复现**：任何人 clone 后 30 分钟内本地跑通完整流水线 | 无 DDL、无容器、依赖手工 SSH 隧道与火山 TOS 账号 | `docker compose up` + `./mvnw verify` 全绿 + 冒烟脚本通过 |
| G2 | markflow**安全可上线** | 口令硬编码、CORS 全开带凭据、登录零限流、apiKey 明文 | 附录 D 的 P0 全部关闭 |
| G3 | markflow**有护栏**：CI 门禁 + 测试覆盖前后端 | 两仓库均无 CI；前端 0 测试 | 前后端 CI 绿灯为合并前提；前端关键模块有测试 |
| G4 | markflow**可运维**：指标、健康检查、失败可见、消息不丢 | 无 actuator、AI 失败静默、MQ 发送失败仅记日志 | Prometheus 指标可采、AI 失败落库可查、MQ 发送失败进 outbox 重试 |
| G5 | markflow**前端体验与性能治理**对齐 LabelHub | 单 JS 1.82 MB、无预算、无监控 | 入口 gzip 预算进 CI；web-vitals 上报 |
| G6 | 移植 LabelHub 有价值的业务功能（可选） | 站内通知、截止提醒、离线提示等markflow均无 | 按 §8 阶段 4 逐项验收 |

---

## 2. 前提与授权

1. **代码使用授权。** markflow两仓库（`github.com/onlyactwo/markflow`、`github.com/onlyactwo/markflow-web`）**均无 LICENSE 文件**，作者为 Li ZhuoXi（onlyactwo）。默认"保留所有权利"。在开始迁移前必须取得作者书面同意（或确认其为团队共同交付物），并在新仓库 README 中保留原作者署名与来源链接。这是硬前提，不满足则停止。
2. **服务器资源。** LabelHub 现有 ECS 为 1.6 GB 内存、且拉不到 docker.io 镜像（`LabelHub/DEPLOY.md` §九）。markflow全栈内存需求见 §9 风险 R1。上线前需确认换用 ≥ 4 GB 的机器或改用系统级安装中间件。
3. **火山 TOS 账号。** 不是必须的：计划引入 S3 兼容适配（本地 MinIO）。若最终仍要用 TOS，只需切换 `markflow.oss.provider=tos` 并在 `sys_config` 写 `tos.config`。
4. **LLM 账号。** 任何 OpenAI 兼容接口（markflow的 `OpenAiCompatibleLlmClient` 只需 baseUrl/apiKey/model）。

---

## 3. 迁移范围定义（三张清单）

### 3.1 必须修复的markflow缺陷（不修则不能上线 / 不能复现）

| 编号 | 缺陷 | 证据 | 归属阶段 |
|---|---|---|---|
| F1 | MySQL/Redis 真实口令作为默认值写死在仓库 | `src/main/resources/application.yml`：`${MARKFLOW_MYSQL_PASSWORD:lzx2005}` | 阶段 1 |
| F2 | CORS 允许任意来源且携带凭据 | `infrastructure/web/config/CorsConfig.java` | 阶段 1 |
| F3 | 鉴权排除 `/api/auth/**` 整段；登录无任何限流 | `infrastructure/web/config/WebMvcConfig.java`；全项目无 rate limit | 阶段 1 |
| F4 | 无 DDL / 无迁移工具；核心设计文档缺失 | 全仓 0 个 `.sql`；git 全史中 `docs/design/数据库.md` 从未存在 | 阶段 1 |
| F5 | 无容器编排；本地开发依赖手工 SSH 隧道到线上中间件 | 后端 `CLAUDE.md` 常用命令一节 | 阶段 1 |
| F6 | 系统管理员靠运行测试类落库；`jwt.secret`/`jwt.expireSeconds` 需手工插入 | `src/test/.../init/SystemAdminInitTest.java`；`AuthDomainServiceImpl.generateToken` 读两个 key | 阶段 1 |
| F7 | 对象存储硬绑定火山 TOS，无本地替代；3 个测试连真实 TOS | `adapter/tos/TosClient.java`；`TosClientTest`/`FileParseDomainServiceTest`/`ExportCaseResultDomainServiceTest` | 阶段 1 |
| F8 | 无 CI；无 Maven wrapper | 两仓库无 `.github/`；后端无 `mvnw` | 阶段 1 |
| F9 | 前端 0 测试 | `package.json` 无 test 脚本、无 vitest 依赖 | 阶段 2 |
| F10 | MQ 发送失败仅 `log.warn`，事件丢失 | `infrastructure/mq/MqProducer.java` | 阶段 2 |
| F11 | AI 任务失败静默：不重试、不落库、运营不可见 | `AiTaskExecutorImpl` 类注释与 catch 块 | 阶段 2 |
| F12 | apiKey 明文存 `sys_config.ai.configList` | `AiConfigDO` 注释、后端 `CLAUDE.md` 铁律 | 阶段 2 |
| F13 | 无 actuator / 指标 / 健康检查 | `pom.xml` 无 actuator | 阶段 2 |
| F14 | 鉴权失败返回 HTTP 200 + `success=false`，前端只在 HTTP 401 时跳登录 → token 过期后不跳转 | `GlobalExceptionHandler` 无状态码映射；前端 `shared/api/http.ts` 仅判 `status === 401` | 阶段 1（随限流任务一并修） |
| F15 | 前端单 JS 1.82 MB（gzip 569 KB）、零代码分割 | `markflow-web-前端/dist/assets/index-*.js` 实测 | 阶段 3 |
| F16 | 文档漂移：前端 CLAUDE.md 称 Puck"暂不做"但已实现；INDEX 引用 8 篇不存在的文档 | 见评估报告 P2-1 | 阶段 3 |
| F17 | 登录后固定跳 `/dataset`，标注员会被路由守卫弹回 | `features/auth/pages/LoginPage.tsx` `navigate('/dataset')`，未用 `pickHomePath` | 阶段 2（随登录冒烟测试修） |

### 3.2 从 LabelHub 移植的资产

| 编号 | 资产 | LabelHub 来源 | 在markflow中的形态 | 阶段 |
|---|---|---|---|---|
| P1 | CI 多门禁流水线思路（lint → typecheck → test → build → 产物） | `.github/workflows/ci.yml` | 后端：`mvnw verify`（起中间件）；前端：lint + tsc + test + build + 体积预算 | 1（基础）/ 2（测试）/ 3（预算） |
| P2 | 可复现三件套思路（compose + 建表 + 一键起） | `docker-compose.yml`、`Dockerfile` | `deploy/docker-compose.yml`（MySQL/Redis/RocketMQ/MinIO）+ Flyway | 1 |
| P3 | 密钥不进仓库、`.env` 加载、失败即退出 | `ecosystem.config.cjs` 注释、`DEPLOY.md` §六 | `spring.config.import=optional:file:./.env[.properties]` + 无默认值占位符 | 1 |
| P4 | 分层限流（全局 IP + 登录失败计数 + 敏感接口） | `server/middleware/apiRateLimit.js`、`loginRateLimit.js` | Redisson `RRateLimiter` 拦截器 + `LoginAttemptLimiter` | 1 |
| P5 | 安全响应头 | `server/middleware/securityHeaders.js` | Nginx 层加（后端只出 JSON，不服务静态资源） | 3 |
| P6 | 前端测试文化（Vitest + Testing Library + 冒烟 helper） | `src/__tests__/helpers/smoke.tsx` 等 14 文件 | `vitest.config.ts` + 权限/导航/HTTP/登录冒烟 4 组测试 | 2 |
| P7 | 消息可靠性意识（重试/兜底） | `notificationService.js` 的重连与持久化 | `mq_outbox` 表 + 失败落库 + 定时重投 | 2 |
| P8 | Prometheus 指标 + 健康检查 | `server/middleware/metrics.js`、`/api/health` | actuator + micrometer-prometheus + 业务指标（池积压、AI 成败、派发数、outbox 积压） | 2 |
| P9 | Bundle 体积预算门禁 | `scripts/check-bundle-size.cjs` | 同脚本移植（解析 `dist/index.html` 入口预加载集）+ 路由懒加载 + `manualChunks` | 3 |
| P10 | web-vitals 采集与上报 | `src/services/webVitals.ts`、`routes/monitoring.js` | 前端同脚本；后端 `POST /api/monitoring/reportWebVitals`（公开、限流）+ SA 汇总接口 | 3 |
| P11 | 部署脚本思路：release 目录 + 原子切换 + 健康检查 + 失败回滚 | `scripts/activate.sh`、`scripts/smoke.sh` | 后端 jar 版 `activate.sh`（systemd）+ `smoke.sh`（health/login/getCurrentUser） | 3 |
| P12 | 运维经验（WAL 备份、密钥不进 pm2 dump、fail2ban、非 root 部署账户） | `DEPLOY.md` | markflow `docs/DEPLOY.md`（重写：mysqldump 备份、systemd `EnvironmentFile`、fail2ban、非 root） | 3 |
| P13 | 站内通知（分配/驳回/截止提醒） | `services/notificationService.js`、通知页面 | `sys_notification` 表 + 消费 `task_dispatched`/驳回事件 + 前端铃铛轮询 | 4 |
| P14 | 截止时间与逾期提醒 | `services/timelinessReminderService.js`、`utils/itemTimeliness.js` | `CaseExt.deadline` + 定时扫描 + 通知 | 4 |
| P15 | 离线状态条 | `components/NetworkStatusBar.tsx`、`hooks/useNetworkStatus.ts` | 执行页顶部离线提示 | 4 |
| P16 | 规则预审引擎（确定性、零成本） | `services/aiReviewEngine.js`（6 条规则） | 作为 `AiTaskExecutor` 的"规则执行器"分支：`AiConfig.provider=rule`，按 labelToolJsonSchema 校验 | 4（可选） |
| P17 | 审核操作历史 | `routes/reviews.js`、`AuditFlowModal.tsx` | `label_task_log` 表 + 任务详情时间线 | 4（可选） |

### 3.3 明确不迁移的内容

| 内容 | 原因 |
|---|---|
| LabelHub 的 SQLite/PostgreSQL 双数据库层 | markflow单 MySQL 更干净 |
| LabelHub 的 Socket.IO 实时通道 | 通知先用轮询；markflow已有 MQ 骨架，WebSocket 留待有实时协作需求时再加 |
| LabelHub 的模板搭建器（8 种字段） | markflow Puck（18 组件）是超集 |
| LabelHub 的线性状态机与 `crudFactory` | 被markflow派发引擎与 DDD 分层取代 |
| LabelHub 线上数据 | 均为测试数据，无迁移价值 |
| LabelHub 的 8 组 `.js/.ts` 重复文件、巨型组件 | 属于 LabelHub 自身的债，随其停止演进一并封存 |

---

## 4. 功能差距矩阵：LabelHub → markflow

对 LabelHub 的 57 个路由端点与 25 个页面逐项对照markflow的 35 个接口与 20 个页面后的结论：

| LabelHub 功能 | markflow对应 | 结论 |
|---|---|---|
| 登录 / 登出 / 当前用户 | `POST /api/auth/login`、`GET /api/user/getCurrentUser` | 已覆盖（markflow无显式登出，前端清 token 即可） |
| 用户 CRUD + 改密码 | `user/create`、`getUserList`、`changePassword` + JSONL 批量导入 | 已覆盖（markflow无删除/禁用接口，`status` 字段已预留，阶段 4 可补） |
| 角色：owner / annotator / reviewer | 工作空间 + LABELER / REVIEWER / LABEL_ADMIN + 系统管理员 | markflow是超集 |
| 模板管理（可视化搭建 8 种字段） | 标注工具（Puck 18 组件 + IFRAME 外接） | markflow是超集 |
| 任务创建 + 分配策略（even_split / manual） | Case 创建 + 5 阶段编排 + FCFS / FIXED_RATIO | markflow是超集（无 manual 逐条指派；固定比例可替代） |
| 任务截止时间 / 逾期策略 / 提醒 | 仅有"在手任务超时自动回收" | **缺失**（P14，阶段 4） |
| 任务归档 / 取消归档 | Case 状态 NOT_STARTED / RUNNING / PAUSED / FINISHED（无状态变更接口） | **部分缺失**：markflow缺"暂停/结束 Case"接口（阶段 4 补 `updateCaseStatus`） |
| 批量导入标注项（JSON，≤ 1000 条） | 数据集 JSONL 上传 + 异步解析（流式、分批） | markflow是超集 |
| 标注工作台：草稿自动保存 | `saveTaskResult`（手动保存按钮） | **部分**：markflow无定时自动保存；阶段 4 在 Puck 渲染器加 debounce 自动保存（小） |
| 标注工作台：乐观锁 version 校验 | 任务在手模型（一条任务同一时刻只在一个人手上） | 不需要 |
| 标注工作台：悲观锁 / 跨标签页锁 | 同上 | 不需要 |
| 标注工作台：断网恢复 / 离线提示 | 无 | **缺失**（P15，阶段 4，小） |
| 客户端实时规则预审（提交前提示） | 无（结果透传不校验） | **缺失**：可用 labelToolJsonSchema 做提交前校验（阶段 4，与 P16 合并考虑） |
| 审核工作台：领取 / 通过 / 驳回 / 重提 | 初检池 / 复检池派发 + 通过 / 驳回打回重标 | 已覆盖（markflow是"派发"而非"自助领取"；FCFS 策略等价于领取） |
| 审核操作历史 | `round` 字段 + 每轮结果 sample | **部分**（P17，可选） |
| 规则预审 PASS / RISK / FAIL | AI 预审（LLM） | markflow更强；规则引擎可作为零成本备选执行器（P16，可选） |
| 实时通知（Socket.IO）+ 通知管理 / 发布 | 无（消费者留有"人工任务一期 no-op：站内信"扩展点） | **缺失**（P13，阶段 4） |
| 统计看板 / 数据看板（ECharts） | 我的贡献看板 + 任务进度（SA） | **部分**：缺全局统计（阶段 4 可选） |
| 性能监控页（web-vitals / 错误上报） | 无 | **缺失**（P10，阶段 3） |
| 健康检查 / Prometheus / Swagger | 无 | **缺失**（P8，阶段 2；Swagger 用 springdoc，阶段 3） |
| 数据导出（CSV / JSON，前端 Worker） | 异步导出 CSV / JSONL 到对象存储 | markflow更强 |

**结论：** markflow在业务主链上是 LabelHub 的超集；真正缺失且值得补的是**通知、截止提醒、离线提示、Case 状态控制**四项业务功能，以及全部工程外围。

---

## 5. 工程差距矩阵：markflow当前状态 vs 目标状态

| 维度 | 当前（实测） | 目标 | 阶段 |
|---|---|---|---|
| 密钥管理 | 口令默认值进仓库；JWT 密钥/管理员靠手工 SQL 或跑测试 | 全部走环境变量；缺失即启动失败；首启幂等引导 | 1 |
| CORS / 鉴权边界 | 全开 + credentials；`/api/auth/**` 免鉴权 | 白名单来源；仅 `/api/auth/login` 免鉴权 | 1 |
| 限流 | 无 | 全局 IP 600/min；登录失败 5 次 / 15 min 锁定 | 1 |
| 数据库结构 | 无 DDL；线上表结构不可知 | Flyway `V1__init.sql`（反推）+ 后续变更用 `V2+` | 1 |
| 本地环境 | SSH 隧道到线上中间件 | `docker compose up` 起 MySQL/Redis/RocketMQ/MinIO | 1 |
| 对象存储 | 火山 TOS 硬绑定 | `ObjectStorageClient` 接口 + S3(MinIO) / TOS 双实现 | 1 |
| 构建 | 需本机装 Maven + jenv | `mvnw` 包装器；JDK 17 或 21 皆可编译 | 1 |
| CI | 无 | 后端：compose + `mvnw verify`；前端：lint + tsc + build | 1 |
| 前端测试 | 0 | Vitest；权限 / 导航 / HTTP 层 / 登录冒烟 | 2 |
| 后端端到端 | 单元级集成测试，无"跑通一条 Case" | 一条 Case 全流程（含 MQ 消费）测试 | 2 |
| MQ 可靠性 | 发送失败仅日志 | 失败落 `mq_outbox` + 定时重投 + 上限后标 FAILED | 2 |
| AI 失败可见性 | 静默 | `label_task.ext.aiFailure` 落库 + 瞬时错误 MQ 重试 3 次 + 详情接口透出 | 2 |
| apiKey 存储 | 明文 | AES-GCM 加密，密钥来自环境变量，兼容读旧明文 | 2 |
| 可观测性 | 无 | actuator health/prometheus（独立管理端口）+ 业务指标 | 2 |
| 前端体积 | 单 JS 1.82 MB | 路由懒加载 + `manualChunks`；入口 gzip 预算进 CI | 3 |
| 前端性能监控 | 无 | web-vitals 上报 + SA 汇总接口 | 3 |
| 文档 | 8 篇被引用文档不存在；CLAUDE.md 与实现漂移 | 从 DDL 生成 `数据库.md`；补 `状态映射.md` 等；同步 CLAUDE.md | 3 |
| 部署 | 无脚本；旧部署手册已撤回 | Dockerfile（后端 jar / 前端 nginx）+ `activate.sh` + `smoke.sh` + 新 `DEPLOY.md` | 3 |

---

## 6. 目标架构与仓库布局

### 6.1 仓库策略

**保持两个独立仓库**（尊重两仓各自的 `CLAUDE.md` 与规范体系），复制到你自己的工作区并保留 git 历史：

```
F:/label/
├── markflow-backend/      ← 复制自 submission/markflow-后端（保留 .git；删除 .idea/、.claude/settings.local.json）
│   ├── deploy/           ← 新增：docker-compose.yml、rocketmq/broker.conf、.env.example、smoke.sh
│   ├── src/main/resources/db/migration/   ← 新增：Flyway V1__init.sql …
│   ├── .github/workflows/backend-ci.yml   ← 新增
│   ├── .mvn/ + mvnw + mvnw.cmd            ← 新增
│   └── docs/                              ← 补齐 design/数据库.md、DEPLOY.md
└── markflow-web/          ← 复制自 submission/markflow-web-前端（保留 .git；删除 *.jsonl 样本）
    ├── .github/workflows/web-ci.yml       ← 新增
    ├── vitest.config.ts + src/**/__tests__ ← 新增（阶段 2）
    └── scripts/check-bundle-size.cjs      ← 新增（阶段 3）
```

远程：`git remote rename origin upstream`，再 `git remote add origin <你的仓库>`。分支命名 `migration/phase-1`、`migration/phase-2`…，每阶段一个 PR。

### 6.2 运行时拓扑（开发 / CI）

```
浏览器 ──5173──▶ Vite dev server ──/api 代理──▶ Spring Boot :8080 (host)
                                                    │  管理端口 :8081 (actuator，不对外)
            docker compose (deploy/)                 │
            ├── mysql:8.0      :3306  ◀──────────────┤
            ├── redis:7        :6379  ◀──────────────┤
            ├── rocketmq namesrv :9876 / broker :10911 ◀┤
            └── minio :9000 (API) / :9001 (控制台) ◀──┘
浏览器 ──预签名 PUT──▶ minio :9000（直传，不过后端）
```

### 6.3 运行时拓扑（生产）

Nginx（443）→ 前端静态 + `/api/` 反代 8080；8080/8081/3306/6379/9876/10911/9000 仅监听内网。中间件按机器情况选 Docker 或系统安装（见 R1、R2）。

---

## 7. 关键技术决策（ADR）

| # | 决策 | 备选 | 选择理由 |
|---|---|---|---|
| ADR-1 | **JDK：CI 用 17（temurin），本机 21 可直接编译** | 强制装 17 | `pom.xml` `java.version=17` 在 Boot 父 POM 下映射为 `maven.compiler.release=17`，JDK 21 编译产物仍面向 17；Boot 3.4.5 管理的 Lombok 1.18.36 支持 21 |
| ADR-2 | **数据库变更用 Flyway**（`V1__init.sql` 反推 + `baseline-on-migrate=true`） | 纯 `schema.sql` | 后续要加 `mq_outbox`、`sys_web_vitals`、`sys_notification` 表；Flyway 让线上库（已有表）以 baseline 接入、新库从 V1 建 |
| ADR-3 | **对象存储抽象 `ObjectStorageClient`，本地/CI 用 MinIO（S3 兼容）** | 保留 TOS 并要求所有人申请账号 | 不改则数据集上传/解析/导出在本地全部不可用；接口只有 4 个方法，抽象成本低；TOS 实现保留可切换 |
| ADR-4 | **保留 RocketMQ**，compose 内单节点 | 换 Redis Stream / Kafka | 4 个 Topic 与消费者已成型且有测试；换 MQ 是无收益重写。单机内存用 `JAVA_OPT_EXT` 压到 512 MB |
| ADR-5 | **限流用 Redisson**（`RRateLimiter` + `RAtomicLong`） | Bucket4j / Guava | 项目已有 Redisson 与 `LockUtil`，零新依赖，多实例天然共享 |
| ADR-6 | **JWT 密钥仍存 `sys_config`，首启由 `ApplicationRunner` 从环境变量幂等写入** | 改为纯环境变量 | 不改 `AuthInterceptor`/`AuthDomainServiceImpl` 两处读取逻辑，兼容现有线上库；测试上下文自动引导 |
| ADR-7 | **测试策略：保留 `@SpringBootTest` 风格，CI 用 compose 提供真实中间件；连外部 TOS 的测试打 `@Tag("external")` 默认排除** | 全部改 Mockito | 43 个测试都是集成风格，改写成本高且损失价值；TOS 相关测试改用 `ObjectStorageClient` 后在 MinIO 上照常运行 |
| ADR-8 | **MQ 可靠性用"失败落库 + 定时重投"（outbox-lite）** | 完整事务性 outbox（先写表再投） | 现有发送点都在 `afterCommit` 后，改成先写表需重构 6 处发送；outbox-lite 覆盖"MQ 不可用"这一主要故障，进程在提交与发送之间崩溃的窗口留待二期 |
| ADR-9 | **通知先用轮询**（TanStack Query `refetchInterval`） | Socket.IO / SSE | markflow无 WebSocket 基础设施；轮询 30 s 对通知场景足够；避免引入 Nginx WebSocket 配置这一 LabelHub 踩过的坑 |
| ADR-10 | **apiKey 用 AES-256-GCM 加密，密钥来自 `MARKFLOW_CONFIG_ENC_KEY`，密文前缀 `enc:v1:`，读取时兼容明文** | 不加密 / 用 KMS | 零外部依赖；前缀让老数据平滑过渡；KMS 在单机部署无必要 |
| ADR-11 | **HTTP 状态码映射**：`UNAUTHORIZED→401`、`FORBIDDEN→403`、`TOO_MANY_REQUESTS→429`，其余仍 200 + `success=false` | 全部 200 | 前端与网关/监控都依赖状态码；只映射三类，不破坏现有前端对业务错误的处理 |

---

## 8. 分阶段路线图与工作量

工作量按"一名熟悉 Java/React 的工程师 + AI 辅助"估算，单位为人日。

### 阶段 0：准备（0.5 人日）

- 取得代码授权；复制两仓库到工作区、改远程、建分支。
- 安装 Maven（`winget install Apache.Maven`），确认 Docker Desktop 运行。
- 验收：`java -version`、`mvn -v`、`docker compose version` 正常；`git log` 保留原历史。

### 阶段 1：可复现 + 安全兜底（4–6 人日）→ 详细计划：`docs/superpowers/plans/2026-09-22-markflow-migration-phase1-reproducible-and-secure.md`

| 任务 | 交付物 | 关闭的缺陷 |
|---|---|---|
| 1.1 环境变量契约 | `application.yml` 去默认口令；`spring.config.import` 读 `.env`；`deploy/.env.example` | F1 |
| 1.2 CORS 白名单 | `CorsProperties` + 改写 `CorsConfig` + MockMvc 预检测试 | F2 |
| 1.3 鉴权边界与状态码 | `WebMvcConfig` 排除收窄；`GlobalExceptionHandler` 返回 401/403/429 | F3、F14 |
| 1.4 本地中间件 | `deploy/docker-compose.yml`（MySQL/Redis/RocketMQ/MinIO + 健康检查 + 桶初始化）、`rocketmq/broker.conf` | F5 |
| 1.5 数据库迁移 | Flyway 依赖 + `V1__init.sql`（11 张表 + 索引）+ `baseline-on-migrate` | F4 |
| 1.6 首启引导 | `SystemBootstrapRunner`：`jwt.secret`/`jwt.expireSeconds`/admin 幂等写入；删除 `SystemAdminInitTest` | F6 |
| 1.7 对象存储抽象 | `adapter/oss/ObjectStorageClient` + `S3ObjectStorageClient`（MinIO）+ `TosClient` 实现接口；3 个测试改用接口，`TosClientTest` 打 external | F7 |
| 1.8 限流 | `GlobalRateLimitInterceptor`（IP 600/min）+ `LoginAttemptLimiter`（5 次/15 min）+ `forward-headers-strategy` | F3 |
| 1.9 构建与 CI | `mvnw`；surefire 排除 `external`；`backend-ci.yml`（compose up → verify）；`web-ci.yml`（lint/tsc/build） | F8 |
| 1.10 冒烟与文档 | `deploy/smoke.sh`（health/login/getCurrentUser）；README"5 分钟起步" | G1 |

**验收：** 干净机器 `docker compose up -d --wait` → `./mvnw verify` 全绿（除 external）→ `java -jar` 起服 → `smoke.sh` 通过 → 前端 `npm run dev` 登录、建数据集（上传到 MinIO）、建 Case、标注、审核、导出全流程手工跑通一次。

### 阶段 2：测试与可靠性（4–5 人日）→ 详细计划：`docs/superpowers/plans/2026-09-22-markflow-migration-phase2-tests-and-reliability.md`

| 任务 | 交付物 | 关闭的缺陷 |
|---|---|---|
| 2.1 前端测试基建 | Vitest + Testing Library + happy-dom；`permissions`、`nav`、`http`、`LoginPage` 冒烟 4 组测试；修 `LoginPage` 用 `pickHomePath`；CI 加 `npm test` | F9、F17 |
| 2.2 后端端到端 | `CasePipelineE2ETest`：上传 JSONL → 解析 → createCase → 标注提交 → MQ 消费流转到初检 → 审核通过 → 导出（Awaitility 等待异步） | G3 |
| 2.3 MQ outbox-lite | `V2__mq_outbox.sql`、`MqOutboxPO/Mapper/Repository`、`MqProducer` 失败落库、`MqOutboxRetryScheduler` | F10 |
| 2.4 AI 失败可见 | `TaskExt.aiFailure`、`TaskRepository.updateExt`、执行器区分瞬时/永久失败、消费者 `maxReconsumeTimes=3`、详情接口透出 | F11 |
| 2.5 apiKey 加密 | `AesGcmCipher` + `AiConfigDomainServiceImpl` 读写加解密 | F12 |
| 2.6 可观测性 | actuator + prometheus（8081）+ `markflowMetrics`（AI 成败、派发数、池积压、outbox 积压） | F13 |

**验收：** 前端 `npm test` ≥ 12 用例绿；后端端到端测试在 CI 通过；人为停掉 RocketMQ 后提交任务 → `mq_outbox` 有行，恢复后 2 分钟内自动投递；错误的 AI 配置 → 任务详情可见失败原因；`curl :8081/actuator/prometheus | grep markflow_` 有业务指标。

### 阶段 3：体验、性能与交付（4–6 人日）→ 计划在阶段 2 完成后编写

| 任务 | 交付物 |
|---|---|
| 3.1 前端体积治理 | 路由级 `React.lazy`（Puck 相关页、执行页、外部示范页）；`build.rollupOptions.output.manualChunks`（react / antd / puck）；移植 `check-bundle-size.cjs`（初始预算：入口预加载 gzip < 250 KB、单 chunk gzip < 400 KB，落地后按实测收紧 15%）进 CI |
| 3.2 web-vitals | 前端 `shared/monitoring/webVitals.ts`（同 LabelHub）；后端 `sys_web_vitals` 表（`V3`）+ `MonitoringController.reportWebVitals`（免鉴权、限流）+ `getWebVitalsSummary`（SA） |
| 3.3 错误上报 | 前端 `window.onerror`/`unhandledrejection` → `reportClientError`；后端落库 + 日志 |
| 3.4 大页面拆分 | `CaseNewPage`（753 行）拆为 `StagePlanForm`/`AssignmentForm`/`useCreateCaseForm`；`CaseDetailPage`、`PuckDemo` 同理 |
| 3.5 文档对齐 | 由 `V1__init.sql` 生成 `docs/design/数据库.md`；补 `状态映射.md`/`菜单栏.md`/`接口层.md`/`权限可见性.md`（从代码反推）；两份 `CLAUDE.md` 去掉"Puck 暂不做"等过期表述；角色 code 契约统一为英文 |
| 3.6 API 文档 | springdoc-openapi（`/v3/api-docs`，仅非生产暴露） |
| 3.7 部署交付 | 后端 `Dockerfile`（多阶段，jar）；前端 `Dockerfile`（nginx，含安全头）；`deploy/docker-compose.prod.yml`；jar 版 `activate.sh`（releases 目录 + systemd 重启 + smoke + 回滚）；新 `docs/DEPLOY.md`（备份用 `mysqldump --single-transaction`，密钥用 systemd `EnvironmentFile=`，fail2ban，非 root）；`backend-cd.yml`（main 推送 → 构建 → 上传 → activate） |

**验收：** 入口 gzip 较 569 KB 至少下降 50%；CI 体积门禁生效；线上 `/actuator/health` 经 Nginx 内网可达；一次 CD 部署 + 一次人为失败回滚演练通过。

### 阶段 4：业务功能移植（5–8 人日，可选，按价值排序）→ 计划待编写

| 优先 | 任务 | 交付物 |
|---|---|---|
| 高 | 4.1 站内通知 | `sys_notification` 表；`NotificationDomainService`；`TaskDispatchDomainMessageConsumer` 人工分支从 no-op 改为写通知；驳回时通知原标注员；前端顶栏铃铛 + 未读数（30 s 轮询）+ 通知列表页 |
| 高 | 4.2 Case 状态控制 | `updateCaseStatus`（RUNNING ↔ PAUSED → FINISHED）；暂停时派发引擎跳过；前端详情页按钮 |
| 中 | 4.3 截止时间与提醒 | `CaseExt.deadline/reminderHours`；`CaseDeadlineScheduler` 每 5 分钟扫描 → 通知；详情页展示 |
| 中 | 4.4 离线提示 + 自动保存 | `NetworkStatusBar` 移植到执行页；Puck 渲染器结果变更 debounce 3 s 调 `saveTaskResult` |
| 低 | 4.5 规则执行器 | `AiConfigDO.provider`（llm / rule）；`RuleTaskExecutor` 按 labelToolJsonSchema 做 required/type/range 校验，输出 `{reviewAction, reviewComment}` |
| 低 | 4.6 操作历史 | `label_task_log` 表 + 任务详情时间线 |
| 低 | 4.7 基础 a11y | 执行页键盘快捷键（上一题/下一题/提交）、焦点管理 |

### 总工作量

| 阶段 | 人日 | 累计 |
|---|---|---|
| 0 准备 | 0.5 | 0.5 |
| 1 可复现 + 安全 | 4–6 | 4.5–6.5 |
| 2 测试与可靠性 | 4–5 | 8.5–11.5 |
| 3 体验、性能与交付 | 4–6 | 12.5–17.5 |
| 4 业务移植（可选） | 5–8 | 17.5–25.5 |

**核心（阶段 0–3）约 13–18 人日；含可选功能约 18–26 人日。** 阶段 1 是投入产出比最高的一步：完成后markflow从"看文档相信"变成"任何人能跑"。

---

## 9. 风险登记册

| # | 风险 | 影响 | 概率 | 缓解 |
|---|---|---|---|---|
| R1 | **生产机内存不足**：LabelHub 现有 ECS 1.6 GB；markflow栈 JVM(≥512 MB) + MySQL(≈400 MB) + Redis(50 MB) + RocketMQ namesrv+broker(≥768 MB 调优后) + MinIO(≈200 MB) ≈ 2–3 GB | 无法上线 | 高 | 上线前换 ≥ 4 GB 机器；或 MinIO 换成真实 TOS、RocketMQ broker 压到 512 MB、JVM `-Xmx768m` 后勉强跑在 4 GB |
| R2 | **docker.io 镜像拉取失败**（LabelHub 在阿里云 ECS 实测拉不到 `node` 镜像） | 生产无法用 compose | 中 | 生产改系统级安装（markflow原作者就是 systemd + 原生中间件，被撤回的 `docs/DEPLOY.md` 可从 git `2da1c82^` 恢复参考）；或用阿里云 ACR 镜像加速/自建镜像仓库 |
| R3 | **反推 DDL 与线上真实表结构不一致**（列类型、长度、索引） | 线上库 Flyway baseline 后，后续 `V2+` 迁移可能与真实结构冲突 | 中 | 上线前用 `mysqldump --no-data` 导出线上真实结构与 `V1` 做 diff，以线上为准修正 `V1`；markflow线上库若能访问，直接以 dump 替换反推版本 |
| R4 | **`label_task` 的 `(case_id, task_type, data_sample_id)` 唯一索引可能与某条未被测试覆盖的插入路径冲突** | 批量入池报唯一键冲突 | 低 | 阶段 1 先建为唯一索引（与幂等语义一致，`DispatchEngineImplTest.enqueueToPool_idempotent` 覆盖）；若端到端测试暴露冲突则降为普通索引并记录 |
| R5 | **RocketMQ 在 Docker Desktop (Windows) 的 broker 通告地址问题** | 客户端连不上 broker | 中 | `broker.conf` 固定 `brokerIP1=127.0.0.1`（markflow原作者踩过同一坑，见恢复的部署手册 §一） |
| R6 | **43 个集成测试彼此共享数据库**，非事务测试（导出、引导）留下数据 | CI 偶发失败 | 中 | CI 每次起全新 compose 卷；本地提供 `docker compose down -v` 重置命令；随机后缀命名已是既有惯例 |
| R7 | **JDK 21 编译与 JDK 17 运行的隐性差异** | 极低 | 低 | CI 固定 temurin 17；本机 21 仅用于开发 |
| R8 | **Puck 0.20 与路由懒加载的样式/ SSR 边界** | 阶段 3 拆包后执行页白屏 | 低 | 懒加载边界放在页面级（`EmbedLabelPage` 整页），不拆 Puck 内部 |
| R9 | **前端测试基建与 Vite 6 / React 18 版本匹配** | 阶段 2 卡在环境 | 低 | 固定 `vitest@^3`、`@testing-library/react@^16`、`happy-dom@^17`；LabelHub 同组合已验证（Vite 6 + Vitest） |
| R10 | **授权风险**：markflow无 LICENSE | 法律/署名争议 | 视情况 | §2 前提 1，取得书面同意后再动手 |
| R11 | **`spring.config.import` 读 `.env` 与 systemd `EnvironmentFile` 双通道**造成"改了 .env 没生效"（LabelHub 踩过：`.env` 从未被加载） | 配置漂移 | 中 | 开发只用 `.env`；生产只用 systemd `EnvironmentFile`，且 `.env` 不随 jar 部署；`smoke.sh` 在部署后校验实际生效值（打印 actuator `info` 中的非敏感配置） |

---

## 10. 切换（Cutover）与回退策略

1. **并行期。** 阶段 1–3 期间 LabelHub 继续在线；markflow先部署到新机器（或同机不同端口/域名）。
2. **验收门。** §11 全部通过后，才把域名/入口切到markflow。
3. **回退。** 切换后 LabelHub 保持可启动 2 周（pm2 `stopped` 状态，不删 release 目录）；回退只需 Nginx 改回 upstream。
4. **数据。** 不迁移 LabelHub 数据；markflow从种子数据起步（admin + 演示工作空间）。
5. **封存。** 2 周无回退需求后，LabelHub 仓库打 tag `archive/final`，README 标注"已被markflow取代"。

---

## 11. 总体验收标准（Definition of Done）

- [ ] 干净机器按 README 在 30 分钟内跑通：compose → verify → 起服 → smoke → 前端登录到导出全流程。
- [ ] 后端 CI（lint 可选、`mvnw verify`）与前端 CI（lint、tsc、test、build、体积预算）在 PR 上为必需检查。
- [ ] 附录 D 的 P0 全部关闭：仓库无口令；CORS 白名单；登录限流；apiKey 密文；鉴权失败 401。
- [ ] `mq_outbox` 与 `aiFailure` 在故障演练中可见且可恢复。
- [ ] `/actuator/health` 与 `/actuator/prometheus` 仅内网可达且有业务指标。
- [ ] 前端入口 gzip 较 569 KB 下降 ≥ 50%，预算门禁生效。
- [ ] `docs/design/数据库.md`、`docs/DEPLOY.md` 存在且与代码一致；两份 CLAUDE.md 无过期表述。
- [ ] 一次 CD 部署 + 一次人为失败回滚演练通过。
- [ ] 新仓库 README 保留原作者署名与来源。

---

## 12. 附录 A：反推的数据库表结构

来源：`po/*.java`（11 个 PO，`@TableName` + `map-underscore-to-camel-case`，无 `@TableField`）、`mapper/*.xml`（列名、`JSON_EXTRACT`、`COLLATE utf8mb4_general_ci`）、`repository/*.java` 的查询条件（索引依据）、各 `*Constants.java` 的长度上限。完整 DDL 见阶段 1 计划的 `V1__init.sql`。

| 表 | 对应 PO | 关键列 | 唯一约束 / 索引依据 |
|---|---|---|---|
| `sys_user` | `UserPO` | `username`(≤10，`UserConstants`)、`display_name`、`password_hash`(BCrypt)、`is_system_admin` tinyint(1)、`status` | `uk_username`；`selectByUsername` |
| `workspace` | `WorkspacePO` | `space_code`(4–32，正则)、`name`、`description` | `uk_space_code`；`selectBySpaceCode` |
| `user_workspace_ship` | `UserWorkspaceShipPO` | `workspace_id`、`user_id`、`role_in_space`(1/2/3)、`creator`、`create_time` | `uk_ws_user_role(workspace_id,user_id,role_in_space)`；`idx_user(user_id)` |
| `sys_config` | `SysConfigPO` | `config_key`、`config_name`、`type`(1–4)、`content`(LONGTEXT)、`description`、`deleted` | `uk_config_key`；键：`jwt.secret`、`jwt.expireSeconds`、`tos.config`、`ai.configList` |
| `markflow_label_tool` | `LabelToolPO` | `label_tool_code`、`label_tool_name`、`label_tool_type`(1/2)、`label_tool_url`、`label_tool_json_schema` json、`label_tool_page_schema` json、`deleted`、`ext` | `uk_code(label_tool_code)` |
| `markflow_dataset` | `DatasetPO` | `space_code`、`dataset_name`(≤128)、`dataset_desc`(≤512)、`dataset_type`(1/2/3)、`service_obj_name`(=labelToolCode)、`latest_version_number`、`deleted`、`ext` | `idx_space_name(space_code,dataset_name,deleted)` |
| `markflow_dataset_version` | `DatasetVersionPO` | `dataset_id`、`version_number`、`version_desc`、`oss_path`、`upload_status`(1/2/3)、`sample_count`、`deleted`、`ext` json | `uk_dataset_version(dataset_id,version_number)`（代码注释确认存在） |
| `markflow_dataset_sample` | `DatasetSamplePO` | `dataset_version_id`、`biz_id` varchar(64)、`sample_data_json` json、`deleted`、`ext` | `idx_version_biz(dataset_version_id,biz_id)`；`idx_version_id(dataset_version_id,id)` |
| `label_case` | `CasePO` | `space_code`、`name`(≤255)、`description`(≤1024)、`data_source_type`、`dataset_version_id`、`label_result_dataset_version_id`、`label_tool_code`、`task_plan_config` json、`assignment_config` json、`status`(1–4)、`version`、`deleted`、`ext` json | `idx_space_status(space_code,deleted,status)`；`idx_space_name(space_code,name,deleted)` |
| `label_task_group` | `TaskGroupPO` | `case_id`、`stage`(1–5)、`type`(1–6)、`annotator`、`name`、`label_tool_code`、`status`(1–3)、`total_count`、`done_count`、`cost_time`、`ext` | `uk_case_type_stage_annotator(case_id,type,stage,annotator)`；`idx_annotator_stage(annotator,type,stage)` |
| `label_task` | `TaskPO` | `case_id`、`task_group_id`、`task_group_seq`、`task_type`(1–5)、`status`(1–5)、`round`、`data_sample_id`、`biz_id`、`annotator`、`claim_time`、`cost_time`、`ext` json、`operator` | `uk_case_type_sample(case_id,task_type,data_sample_id)`（幂等）；`idx_group_status_seq(task_group_id,status,task_group_seq)`；`idx_annotator_status(annotator,status,task_type)`；`idx_claim_time(claim_time)` |

字符集：库级 `utf8mb4` / `utf8mb4_general_ci`（`TaskMapper.xml` 的 `selectLabelerVerdict` 显式对齐到 `utf8mb4_general_ci`，且 MySQL 8 默认 `utf8mb4_0900_ai_ci` 会与之冲突）。时间戳统一毫秒 `bigint`。审计四件套 `creator/operator/create_time/update_time`（`label_task`、`label_task_group` 无 creator/deleted，与 PO 一致）。

阶段 2、3 新增：`mq_outbox`（V2）、`sys_web_vitals`（V3）；阶段 4：`sys_notification`、`label_task_log`。

---

## 13. 附录 B：环境变量与 sys_config 键清单

### 环境变量（迁移后）

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `MARKFLOW_MYSQL_HOST` / `PORT` / `DB` / `USERNAME` | 否 | `127.0.0.1` / `3306` / `markflow` / `root` | |
| `MARKFLOW_MYSQL_PASSWORD` | **是** | 无（缺失即启动失败） | |
| `MARKFLOW_REDIS_HOST` / `PORT` | 否 | `127.0.0.1` / `6379` | |
| `MARKFLOW_REDIS_PASSWORD` | **是** | 无 | |
| `MARKFLOW_ROCKETMQ_NAMESERVER` | 否 | `127.0.0.1:9876` | |
| `MARKFLOW_JWT_SECRET` | 首启是 | 无 | 仅当 `sys_config.jwt.secret` 不存在时使用；`openssl rand -base64 48` |
| `MARKFLOW_JWT_EXPIRE_SECONDS` | 否 | `86400` | 同上，首启写入 |
| `MARKFLOW_ADMIN_INITIAL_PASSWORD` | 首启是 | 无 | 仅当 `admin` 不存在时使用 |
| `MARKFLOW_CORS_ALLOWED_ORIGINS` | 否 | `http://localhost:5173` | 逗号分隔 |
| `MARKFLOW_OSS_PROVIDER` | 否 | `s3` | `s3` / `tos` |
| `MARKFLOW_S3_ENDPOINT` / `REGION` / `ACCESS_KEY` / `SECRET_KEY` / `BUCKET` | provider=s3 时 | 本地 MinIO 值 | endpoint 必须是浏览器可达地址（预签名直传） |
| `MARKFLOW_RATE_LIMIT_GLOBAL_PER_MINUTE` | 否 | `600` | 每 IP |
| `MARKFLOW_RATE_LIMIT_LOGIN_MAX_FAILURES` / `LOGIN_WINDOW_MINUTES` | 否 | `5` / `15` | |
| `MARKFLOW_CONFIG_ENC_KEY` | 阶段 2 起是 | 无 | 32 字节 base64，apiKey 加密 |
| `MARKFLOW_SERVER_PORT` / `MARKFLOW_MANAGEMENT_PORT` | 否 | `8080` / `8081` | |

### sys_config 键

| 键 | 类型 | 写入方式 | 说明 |
|---|---|---|---|
| `jwt.secret` | STRING | 首启引导 | 签名密钥 |
| `jwt.expireSeconds` | STRING | 首启引导 | 过期秒数 |
| `tos.config` | JSON | 手工 / 后台 | 仅 provider=tos |
| `ai.configList` | JSON | `createAiConfig`/`updateAiConfig` 接口 | 阶段 2 起 apiKey 字段为 `enc:v1:` 密文 |

---

## 14. 附录 C：本机环境检查结果（2026-09-22 实测）

| 项 | 结果 | 处理 |
|---|---|---|
| Java | OpenJDK 21.0.12 (Microsoft) | 可用（ADR-1）；CI 用 17 |
| Maven | **未安装** | 阶段 0 安装；阶段 1 加 `mvnw` 后不再需要 |
| Docker | 29.6.2；Compose v5.3.1 | 可用 |
| Node / npm | 24.14.0 / 11.9.0 | 可用（前端 CI 固定 Node 22） |
| Git | 2.52.0 | 可用 |

---

## 15. 附录 D：迁移中发现的markflow隐藏问题（评估报告未覆盖）

| # | 问题 | 位置 | 处理 |
|---|---|---|---|
| D1 | 被撤回的部署手册（git `2da1c82^:docs/DEPLOY.md`）漏写 `jwt.expireSeconds`，按它部署登录必报错 | 历史文档 | 引导器写入 |
| D2 | `sys_config` 的 `type` 列在旧手册中写作 `config_type`（与 PO 不一致） | 同上 | 以 PO 为准 |
| D3 | 全部测试为 `@SpringBootTest`，无任何 Mockito；`FixLabelToolSchemaTest` 是数据修复脚本伪装成测试，非事务、改线上数据 | `src/test/.../init/` | 删除或移到 `src/main` 的一次性命令；surefire 默认排除 `init` 包 |
| D4 | `TaskDO.ext` 是 `JsonNode`，违反自家"ext 必须强类型 POJO"规范 | `domain/task/model/TaskDO.java` | 阶段 2 改为 `TaskExt` |
| D5 | `MqProducer.send` 捕获 `Exception` 后仅 warn，与 error-logging 规范"吞掉需 log.error"不一致 | `infrastructure/mq/MqProducer.java` | 阶段 2 改 error + 落库 |
| D6 | 前端 `queryClient.staleTime=0` + `RequireAuth` 每次挂载可能重复拉 `getCurrentUser` | `shared/api/queryClient.ts` | 阶段 3 评估 |
| D7 | `LoginPage` 固定跳 `/dataset` | `features/auth/pages/LoginPage.tsx` | 阶段 2 修 |
| D8 | 前端 `dist/` 被提交进交付包但 `.gitignore` 忽略 dist；`*.jsonl` 样本在仓库根 | 前端仓库 | 阶段 0 清理 |
| D9 | `AuthInterceptor` 对每个请求查一次 `sys_config` 取 JWT 密钥（无缓存） | `infrastructure/web/interceptor/AuthInterceptor.java` | 阶段 2 加 60 s 本地缓存（随 outbox 任务顺带） |
