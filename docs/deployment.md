# 灵枢 M6 部署与切换手册

**当前仅完成部署前准备。服务器尚未准备好，未部署、未切域名、未 push，也未启用 CD。** 本文命令供后续服务器就绪后执行；本地构建、测试和打包不需要服务器。M6 的真实服务器、GitHub CI 和业务切换验收仍待完成。

本文仓库文件路径与本地构建命令均相对于 `lingshu-server/` 根目录；Linux 服务器命令中的绝对路径保持原样。

## 1. 发布模型与资产

目标为 Linux（建议 Ubuntu 24.04 LTS）、Node 22+、PM2 单实例 fork、Nginx、PostgreSQL 16、Redis 7，以及 MinIO 或 TOS S3。建议至少 2 核 / 4 GB，给数据库、对象存储与构建留余量；生产不在服务器编译前端。Docker Compose 仍是开发/CI 资产，不直接当作生产配置。

```text
/srv/lingshu/
  releases/<release>/
    server/{dist,package.json,package-lock.json,node_modules}
    web/{index.html,assets/...}
    scripts/{activate.sh,smoke.sh,smoke.mjs}
    ecosystem.config.cjs
    release.json                 # 配对的前后端 SHA、构建时间、工作区是否有改动
  current -> releases/<release>   # 同一文件系统内 mv -T 原子切换
  shared/
    server.env                   # 0600，只由 Node --env-file 读取
    smoke.env                    # 0600，专用冒烟账号
    public-url                   # 候选 Nginx HTTPS 地址，单行、无引号
    backup.env / pgpass           # 0600
    backup-pg.sh
    deploy.lock
  incoming/                      # 上传的 tar.gz 与 SHA256
  backups/                       # 0700，不随 release 清理
```

`activate.sh` 安装生产依赖、校验配置、切 current、PM2 delete/start、执行直连 API 与 Nginx 全链路冒烟，最后 `pm2 save`。PM2 可能缓存真实脚本路径，所以不使用 reload；切换有数秒服务间断。失败会切回前一目录并重新冒烟，**即使回滚成功仍返回非零**；首发失败停进程并移除 current。脚本用 flock 串行化，拒绝路径穿越和 release 外部软链。不自动删 release，至少保留当前与上一版及最近五次成功版本。

**代码回滚不回滚数据库迁移或业务数据。** 启动仍自动向前迁移；后续迁移须采用先扩展后收缩的兼容策略。破坏性迁移必须先备份、安排停写窗口，并验证旧代码能否读取新 schema；不满足时禁用自动切换，改专项迁移。M6 本次没有数据库迁移。

## 2. 本地准备（可立即执行）

在两个仓库分别安装锁定依赖并构建：

```bash
# lingshu-server
npm ci
npm run infra:up
npm run lint
npx prettier --check src tests
npm run typecheck
npm test
npm run build
bash -n scripts/activate.sh scripts/smoke.sh scripts/backup-pg.sh scripts/test-activate.sh
shellcheck scripts/activate.sh scripts/smoke.sh scripts/backup-pg.sh scripts/test-activate.sh
bash scripts/test-activate.sh  # Linux 临时目录 + 假进程，无真实部署

# lingshu-web
npm ci
npx eslint . --max-warnings 100
npm run typecheck
npm test
npm run build:check

# 返回 lingshu-server；release 名不得重复
node scripts/package-release.mjs ../lingshu-web ./artifacts m6-candidate
tar -C artifacts -czf m6-candidate.tar.gz m6-candidate
sha256sum m6-candidate.tar.gz > m6-candidate.tar.gz.sha256
```

打包仅复制白名单文件，不含 `.env`、源码、Git 或 node_modules；`artifacts/` 被忽略。Windows 可用 PowerShell 运行 Node 打包，Linux 脚本用容器验证。正式发布应使用两个干净工作区，确认 `release.json` 的 `serverDirty/webDirty=false`，并保存校验和与测试记录。构建机与生产均使用 Node 22+。

## 3. 服务器初始化（待服务器就绪）

1. 管理员安装 Node 22 LTS、固定版本 PM2、Nginx、PostgreSQL 16 客户端/服务、Redis 7、bash/coreutils/util-linux、fail2ban。记录版本与安装来源；`pg_dump` 不得低于服务端大版本。
2. 创建专用非 root 系统用户 `lingshu`（home 可用 `/home/lingshu`，只允许 SSH 密钥）；运行应用/发布脚本/PM2 均用该用户。用户只拥有 `/srv/lingshu`，不授予任意 sudo；root 单独维护 Nginx、systemd、数据库系统配置。创建 `/srv/lingshu/{releases,incoming,shared,backups}`，根目录及 releases 为 0755，shared/backups 为 0700，归 lingshu 所有。Nginx 用户需能遍历目录并读取 web（目录 0755、文件 0644）。
3. 防火墙只开放 80/443，SSH 限管理来源；5432、6379、8080、9000/9001 仅回环/受控私网。`LINGSHU_SERVER_HOST` 默认 `127.0.0.1`，Nginx 同机时 `LINGSHU_TRUST_PROXY=loopback`，不要使用 `true` 信任任意转发头。
4. PostgreSQL 建 `lingshu` 登录角色（非超级用户）与其拥有的 `lingshu` 数据库；用 `psql` 的 `\password lingshu` 交互设置强密码。配置 `listen_addresses='localhost'`、SCRAM 认证与仅本机连接的 pg_hba。迁移需要 citext 扩展；库 owner 可创建可信扩展，也可先由 DBA 在目标库执行 `CREATE EXTENSION IF NOT EXISTS citext;`。不要在生产运行 npm test（它会重建 `*_test` schema）。
5. Redis 设置 `bind 127.0.0.1`、`protected-mode yes`、独立强密码、`appendonly yes`、`appendfsync everysec`、`maxmemory-policy noeviction`；容量按队列增长配置（初始至少 256 MB）。BullMQ 不应使用会逐出任务键的缓存策略。
6. 安装并开启 fail2ban 的 sshd jail（如 maxretry=5、findtime=10m、bantime=1h）；确认 SSH key 登录成功后关闭密码与 root 远程登录。通过云控制台保留应急入口。应用登录已有失败限流，不将整个 API 的 401 直接作为 SSH 封禁规则。

## 4. 对象存储与密钥

二选一：

| 项目 | MinIO | TOS S3 兼容端点 |
|---|---|---|
| 运维 | 自建服务，独立磁盘、进程/存储备份 | 服务商托管，配置生命周期/版本化/备份 |
| 服务端 endpoint | `http://127.0.0.1:9000` | 对应区域真实 S3 API HTTPS endpoint |
| public endpoint | `https://objects.example.com` | 浏览器可达且能正确签名的 HTTPS endpoint |
| path style | `true` | 按实际 S3 兼容方式，通常 `false` |
| 权限 | 专用桶访问账号，不用 root | 最小权限的专用访问密钥 |

MinIO 以独立非 root 用户运行并用 systemd 管理；配置 `MINIO_API_CORS_ALLOW_ORIGIN=https://app.example.com`，创建私有桶 `lingshu`。API 仅本机监听，经 `deploy/nginx/minio.conf` 暴露 HTTPS；控制台只在管理网络访问。TOS 使用对应区域文档确认桶、S3 endpoint、凭据和 CORS。

应用账号需要桶 HEAD（通常依赖 ListBucket 授权）、对象 GET/HEAD/PUT，以及大文件 multipart 创建、上传、完成、终止权限；限制在本桶。CORS 允许实际前端 origin、PUT/GET/HEAD、所需 Content-Type/x-amz-* 请求头，暴露 ETag；不要给桶匿名公共写权限。后端 HEAD 桶通过只证明服务端读权限，不证明浏览器 CORS、写权限或公网 DNS，必须再跑上传/导出验收。

`LINGSHU_S3_PUBLIC_ENDPOINT` 用于签名，必须是浏览器实际访问的地址；Nginx 保留 Host 和 URI，不加路径前缀，不重定向已签名请求。若虚拟主机寻址产生 `bucket.endpoint`，证书、DNS、CSP 的 connect-src 必须覆盖**最终签名 URL 的 origin**。

将 `deploy/server.env.example` 复制到 `shared/server.env`，手动填空白项。用 `openssl rand -base64 48` 分别生成 JWT、配置加密、metrics 密钥；不要复用本地示例值。env 文件可用单/双引号包裹含 `#`、空格的值，**不支持 shell 命令替换，不要 source 它**。所有 env 文件权限 0600。

`jwt.secret` 与初始管理员只在首次引导时写入数据库，改 env 不会轮换已有账号/JWT。`LINGSHU_CONFIG_ENC_KEY` 丢失会导致 AI key 无法解密，必须独立加密异地备份。PM2 配置只保存 env-file 路径，脚本以干净父进程环境调用 PM2；须使用此专用账号创建干净 PM2 daemon，已有混入密钥的 daemon/dump 应先清理后重新建立。用 `pm2 startup` 生成并由管理员安装开机启动命令，然后核对其用户、home 与 Node 路径；升级 Node 后重新生成。

## 5. Nginx 与首发

将 `deploy/nginx/lingshu-security.conf` 安装为 `/etc/nginx/snippets/lingshu-security.conf`，应用和可选对象存储模板安装到 conf.d。替换所有 example 域名、证书、目录与端口，调整 CSP 的对象存储/外链工具来源；在新候选域名下配置 DNS/TLS。安全头包含 nosniff、DENY、Referrer-Policy、Permissions-Policy、HSTS 与 CSP。验证 `nginx -t` 后由管理员 reload。不要在 HTTP 上照搬 HSTS 配置。

生产 API `127.0.0.1:8080`；若旧服务占用端口，须同时修改 server.env、Nginx upstream、`LINGSHU_SMOKE_BASE_URL` 和 Prometheus target。`shared/public-url` 保存候选 Nginx URL，例如 `https://candidate.example.com`（无尾斜杠），不应指向 LabelHub。`shared/smoke.env` 由 smoke.env.example 复制，先填首发可登录账号；首发验收后建立专用普通账号替换管理员凭据。

后续就绪时，上传 tar.gz 与校验和到 incoming，在服务器以 lingshu 用户执行：

```bash
cd /srv/lingshu/incoming
sha256sum -c m6-candidate.tar.gz.sha256
test ! -e /srv/lingshu/releases/m6-candidate
tar --no-same-owner -xzf m6-candidate.tar.gz -C /srv/lingshu/releases
bash /srv/lingshu/releases/m6-candidate/scripts/activate.sh m6-candidate
```

脚本自动跑健康/登录/当前用户/匿名与坏 token 的 401、Nginx index 不缓存、JS immutable、安全头、SPA 深链和缺失资源 404。还核对 API health 的 `releaseId` 与前端 `/release.json`，防止错误 upstream/静态根目录指向旧版却被判定发布成功。PM2 自动设置非敏感的 `LINGSHU_RELEASE_ID`，不要在 server.env 手工设置。任何一项失败触发回滚。Node `--env-file` 的现有进程环境优先，因此不要在运行发布的 shell 中预先导出应用密钥。

独立运行冒烟：

```bash
LINGSHU_SMOKE_ENV_FILE=/srv/lingshu/shared/smoke.env \
  bash /srv/lingshu/current/scripts/smoke.sh https://candidate.example.com
```

人工回滚同样调用某个已保留 release 的脚本，传旧 release 名；不修改数据库。若回滚后仍不健康，先查 PG/Redis/对象存储及 schema 兼容性，保留日志和失败 release。

静态目录随 current 切换，升级前已打开的页面可能继续请求旧的懒加载 hash 文件；首次采用维护窗口并要求刷新页面。需要无感升级时再增加跨 release 的哈希资源保留机制；不要把失效 JS fallback 成 index.html。

## 6. 监控与告警

- `/api/health` 为匿名 readiness：并发探测 PG、Redis、S3 HEAD 桶、四个 BullMQ 队列命令/暂停状态，单项最多等 2 秒、共享短缓存；故障 HTTP 503，不回显内部地址或凭据。它不调用 LLM，不写对象，不保证 worker 正在消费或浏览器上传正常。
- `/api/metrics` 使用 `prom-client`，`LINGSHU_METRICS_TOKEN` 未配置时 404，错误凭据 401。Nginx 公网固定拒绝此路径，Prometheus 同机直连并以 `Authorization: Bearer …` 抓取。依赖采集失败/3 秒超时返回 503，避免把旧值当作健康状态。
- 请求直方图 `lingshu_http_request_duration_seconds`：标签 method/路由模板/status；鉴权等在路由匹配前拒绝的请求归 `unmatched`，不含查询参数、username、caseId。业务错误仍遵循原契约 HTTP 200，因此 HTTP 5xx 不等于全部业务失败。
- `lingshu_pool_pending_tasks{stage}`：未删除且运行/暂停 case 中、仍在池组的待派/重做任务；不包括个人组在手任务或已结束 case。stage=1–5，五阶段缺失时归零。
- `lingshu_ai_executions_total{stage,outcome}`：success/retryable_failure/permanent_failure，重试每次计数、skipped 不计；进程重启归零，用 rate/increase 看趋势。
- `lingshu_queue_jobs{queue,state}`：四队列各状态即时数量，failed 是最多保留 1000 条的历史失败任务，不是累计失败率。`lingshu_outbox_pending_messages`、`lingshu_outbox_oldest_age_seconds` 显示待投递数和最长等待时间。
- Node 进程内存/GC/事件循环指标自动采集；默认 Prometheus 单实例配置见 `deploy/prometheus.yml`，告警见 `lingshu-alerts.yml`，按真实负载调整阈值并配置 Alertmanager 接收通道（本次不发送任何通知）。另对健康 URL 做 HTTP blackbox 检测，并监控磁盘容量、证书到期和备份任务失败。

当前按规划使用 PM2 单实例。若扩多实例，DB/队列 gauge 是共享全局值，不要跨实例求和；AI/HTTP counter 可聚合。指标直接查表，数据量增长后应评估索引与采集频率。已读通知 90 天清理、截止扫描超过 500 case 的分页优化仍是后续运维事项，本次不自动删除通知。

## 7. 备份与恢复演练

复制 backup.env.example 与 backup-pg.sh 到 shared，创建 `shared/pgpass`（0600，格式 `host:port:database:user:password`，密码中的 `:` 和 `\` 按 libpq 规则转义）。不要在命令行或日志放 PG 密码。安装 `deploy/systemd/lingshu-backup.{service,timer}` 到 `/etc/systemd/system`，管理员 daemon-reload，先手动启动 service 并检查 journal，再 enable --now timer；每日服务器本地时间 03:15 运行。服务使用 lingshu 用户，备份目录 0700。

脚本先写 `.partial`、检查 `pg_restore --list` 再原子改名，保存 SHA256；这不等于恢复成功。备份完成后用组织选定的加密异地存储工具上传，检查远端校验和后才执行保留策略：建议本地至少 7 天、异地每日 30 天与每月 12 份。脚本不自动删除，需同时设置磁盘告警并落实保留作业。还要备份对象桶（MinIO 使用对象复制/版本化、TOS 配置跨区/备份策略）、加密配置密钥、服务器配置；仅 pg_dump 无法恢复上传和导出文件。

上线前以及每月至少恢复一次到隔离环境：

```bash
sha256sum -c lingshu-<timestamp>.dump.sha256
createdb --owner=lingshu lingshu_restore
pg_restore --exit-on-error --no-owner --no-privileges \
  --dbname=lingshu_restore lingshu-<timestamp>.dump
```

用具备建库权限的管理账户建隔离库，恢复时用目标 owner；不要覆盖生产库。运行恢复实例时使用独立 Redis/队列前缀、独立对象桶副本及端口，并关闭真实外部 LLM/通知出站能力，验证登录、样本、结果、下载与 AI 密钥解密。记录恢复时间、数据时间点、RPO/RTO；每日备份理论 RPO 约 24 小时，生产前由负责人确认是否需要 WAL/PITR。Redis 应保留 AOF 并做副本备份；outbox 在投递成功后删除，不能假设 PostgreSQL 备份可以重建全部已入 Redis 的任务，恢复队列需专项核对 DB 任务与 BullMQ 状态。

## 8. CI/CD（目前关闭）

两个仓库的 CI 均支持 push/PR/手动运行，前后端的检查与构建都有门禁。后端已修复 CI Redis 密码缺失；MinIO 初始化会明确验证 readiness。后端没有 origin，前端现有 upstream 为来源仓库，**不要把来源仓库直接当作自己的发布目标**。先由项目负责人确定新的 GitHub 仓库/权限，再配置 remote 并 push；本次未做这些外部操作。

`deploy.yml` 已就位，仓库变量 `LINGSHU_DEPLOY_ENABLED` **未设置或 false 时所有部署 job 跳过**。服务器未就绪前保持关闭。启用后：main 的成功 push CI 触发配对构建；也可 main 手工触发。后端使用 CI 对应 SHA，前端使用显式固定的 40 位 SHA，重新运行两个仓库全部检查与后端集成测试，组装 tar/校验和；production environment 的发布 job 才读取 SSH 凭据、上传、校验并激活。不会自动切换 LabelHub 域名。

后续准备的 GitHub 配置：

| 类型 | 名称 | 内容 |
|---|---|---|
| Repository variable | `LINGSHU_DEPLOY_ENABLED` | 仅服务器首发、备份与回滚演练通过后设 `true` |
| Repository variable | `LINGSHU_WEB_REPOSITORY` | 自有前端 `owner/repo` |
| Repository variable | `LINGSHU_WEB_SHA` | 与后端配对验收的完整 40 位 commit SHA；前端变更后更新并手工触发后端发布 |
| Repository secret | `LINGSHU_WEB_READ_TOKEN` | 私有前端仓库 contents:read 凭据；公开仓库可省略 |
| production environment secrets | `LINGSHU_DEPLOY_HOST/USER/PORT` | 服务器 DNS/IPv4、非 root lingshu、SSH 端口（显式填 22） |
| production environment secrets | `LINGSHU_DEPLOY_KEY` | 专用 SSH 私钥 |
| production environment secrets | `LINGSHU_DEPLOY_KNOWN_HOSTS` | 经服务器控制台/可信渠道核对的 host key；非默认端口使用 `[host]:port` |

production environment 限制 main，建议配置 reviewer；禁止免 host key 校验。密钥仅用于服务器上传/执行，不赋予 root。后端 API 密钥留在 shared/server.env，不进入 GitHub artifacts。首次手动部署成功后再启用自动发布；GitHub 实跑记录仍是 M6 待验收项。

## 9. 上线、切换和 LabelHub 封存检查表（待执行）

- [ ] 服务器规格、域名、TLS、存储方案、备份去向与 RPO/RTO 已确定；强凭据已填齐。
- [ ] 两个自有仓库 CI 在 GitHub 真正全绿；产物 SHA 与验收版本一致。
- [ ] 干净服务器按本手册首发成功；PM2/systemd 重启自恢复、日志轮转、备份与恢复演练通过。
- [ ] 候选域名与 LabelHub 并行；`smoke.sh` 通过，已演练启动失败/冒烟失败回滚。
- [ ] 在候选环境运行 `scripts/smoke/smoke-m1.mjs`、m2、m3 与前端 `e2e-m3/m4/m5.mjs`，覆盖浏览器真实 HTTPS 直传、导出、通知、截止、禁用和审核。`smoke-m3` 假 LLM 在执行脚本的本机监听，需与后端同机/在隔离验收环境执行；它会创建测试数据，不是只读生产探针。
- [ ] 明确旧 LabelHub 数据的保留/迁移策略。本项目没有自动迁移历史数据工具，不能以代码就绪推断历史数据已迁移。涉及导入时先做数据映射与核对，并定义停写窗口，避免两系统继续产生分叉写入。
- [ ] 业务负责人验收后才改业务域名对应 Nginx 的静态根目录 **和** API upstream（两者一起切），验证配置后 reload；不是只改 upstream。如改 DNS，提前规划 TTL。
- [ ] 切后重新跑轻量冒烟与核心人工流程；异常时回退 Nginx 和配套静态目录，数据变更先评估再处理。
- [ ] LabelHub 保持可启动、配置/数据库/对象数据可恢复至少两周；观察期后才打 `archive/final` 并在其 README 标明归档。当前没有修改 LabelHub。

PM2 日志需设置 logrotate（每日/大小轮转、保留 14 天并按需脱敏归档），Nginx/系统日志使用发行版 logrotate；不要打印 .env、PM2 dump、token、S3 签名 URL。交接时补录部署时间、服务器、域名、配对 SHA、CI URL、冒烟和恢复演练结果，再将 M6 标为完成。
