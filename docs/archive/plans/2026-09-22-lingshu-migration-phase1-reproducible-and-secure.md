> 已归档：本计划已被替代，仅用于历史追溯，不作为当前执行指令。请阅读 [当前总规划](../../plans/0002-2026-09-22-规划-迁移总规划.md)。

# 灵枢迁移 · 阶段 1：可复现 + 安全兜底 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让灵枢后端在任何一台装了 Docker + JDK 17/21 的机器上，从零 `docker compose up` → `./mvnw verify` → `java -jar` → 冒烟通过，且不再带默认口令、任意来源 CORS、无限流登录、硬绑定火山 TOS 这四类缺陷。

**Architecture:** 保持灵枢现有 DDD 五层与 `@SpringBootTest` 集成测试风格不动；所有新增能力都放在 `infrastructure/`（横切）或 `adapter/`（外部系统）包下，通过 `application.yml` 中的 `lingshu.*` 配置项 + 环境变量注入，领域层只依赖新引入的 `ObjectStorageClient` 接口。数据库结构由 Flyway `V1__init.sql` 管理，首启由 `SystemBootstrapRunner` 幂等写入 JWT 密钥与 admin。

**Tech Stack:** Java 17（CI）/ 21（本机）、Spring Boot 3.4.5、MyBatis-Plus 3.5.9、Redisson 3.39.0、RocketMQ Spring 2.3.1、Flyway（Boot 管理版本）、AWS SDK v2 `s3`（对接 MinIO）、Docker Compose v2、GitHub Actions、JUnit 5 + AssertJ + MockMvc。

## Global Constraints

- 工作目录：后端 `F:/label/lingshu-backend/`（Task 0 从 `F:/label/submission/LingShu-后端/` 复制而来，含 `.git`）；前端 `F:/label/lingshu-web/`（从 `F:/label/submission/lingshu-web-前端/` 复制）。以下所有相对路径均相对于后端仓库根，除非写明"前端仓库"。
- 分支：两个仓库均在 `migration/phase-1` 上工作；原远端改名为 `upstream`，**不得 push 到 upstream**。
- 前提：使用灵枢代码须已获得作者（GitHub onlyactwo）的书面授权（仓库无 LICENSE）。未获授权前只在本地进行，不发布。
- 编码规范（灵枢 `docs/standards/`）：不引入 `record`；DO/PO 用 Lombok `@Data @Builder @NoArgsConstructor @AllArgsConstructor`；敏感字段 `@ToString.Exclude`；不用 BeanUtils；错误一律 `ServiceException.of(ErrorCode)`；日志中禁止出现密钥/口令/token。
- 时间戳统一毫秒 `BIGINT`；库与表字符集 `utf8mb4` / `utf8mb4_general_ci`。
- 测试：延续 `@SpringBootTest` 集成测试（需要 compose 中的中间件在线）；纯逻辑用普通 JUnit；需要外部云资源的测试打 `@Tag("external")`，默认排除。
- 提交信息：Conventional Commits，英文标题 `type(scope): summary`（小写开头、无句号、≤72 字符），空一行后中文正文说明原因/变更/风险；**不要**添加任何署名/attribution 行；不得提交 `.env`、密钥、口令。
- 本机没有 Maven：一切 Maven 命令用 Task 0 生成的 `./mvnw`（Git Bash）或 `mvnw.cmd`（cmd/PowerShell）。
- 中间件口令仅存在于仓库根 `.env`（已 gitignore），测试与 compose 共用这一份。
- 报告任务编号映射：Task 0=阶段 0 + 报告 1.9 的 mvnw 部分；Task 1=1.1；Task 2=1.4；Task 3=1.5；Task 4=1.6；Task 5=1.2；Task 6=1.3+F14；Task 7=1.7；Task 8=1.8；Task 9=1.9；Task 10=1.10。执行顺序按本文 Task 编号（先有中间件与表结构，才能跑集成测试）。

---

## 文件结构总览

后端新增/修改（相对仓库根）：

| 路径 | 职责 |
|---|---|
| `mvnw`, `mvnw.cmd`, `.mvn/wrapper/maven-wrapper.properties` | Maven Wrapper |
| `.env`（gitignore）, `deploy/.env.example` | 环境变量契约 |
| `src/main/resources/application.yml` | 去默认口令；`spring.config.import`；`lingshu.*` 配置节；Flyway；actuator |
| `deploy/docker-compose.yml`, `deploy/rocketmq/broker.conf` | 本地中间件 |
| `src/main/resources/db/migration/V1__init.sql` | 11 张表 DDL |
| `src/main/java/.../infrastructure/bootstrap/{BootstrapProperties,SystemBootstrapRunner}.java` | 首启引导 |
| `src/main/java/.../infrastructure/web/config/{CorsProperties,CorsConfig,WebMvcConfig}.java` | CORS 白名单、拦截器注册 |
| `src/main/java/.../infrastructure/common/error/ErrorHttpStatus.java`、`.../exception/GlobalExceptionHandler.java` | 错误码 → HTTP 状态映射 |
| `src/main/java/.../adapter/oss/{ObjectStorageClient,PreSignedUrl,OssErrorCode,S3Properties,S3ObjectStorageClient}.java` | 对象存储抽象 + S3/MinIO 实现 |
| `src/main/java/.../adapter/tos/TosClient.java` | 实现 `ObjectStorageClient`，仅 provider=tos 时装配 |
| `src/main/java/.../infrastructure/ratelimit/{RateLimitProperties,RateLimitedException,GlobalRateLimitInterceptor,LoginAttemptLimiter}.java` | 限流 |
| `src/main/java/.../controller/AuthController.java` | 接入登录失败计数 |
| `.github/workflows/ci.yml` | 后端 CI |
| `deploy/smoke.sh`, `README.md` | 冒烟与快速起步 |

前端仓库新增：`.github/workflows/ci.yml`。

包前缀 `com.onlyactwo.lingshu` 下文简写为 `...`。

---

### Task 0: 仓库落位与 Maven Wrapper

**Files:**
- Create: `F:/label/lingshu-backend/`（复制）、`F:/label/lingshu-web/`（复制）
- Create: `mvnw`, `mvnw.cmd`, `.mvn/wrapper/maven-wrapper.properties`

**Interfaces:**
- Produces: 后续所有任务使用的 `./mvnw`；分支 `migration/phase-1`；远端 `upstream`。

- [ ] **Step 1: 复制两个仓库（保留 .git）并改远端名、建分支**

```bash
cd /f/label
cp -r "submission/LingShu-后端" lingshu-backend
cp -r "submission/lingshu-web-前端" lingshu-web
cd /f/label/lingshu-backend && git remote rename origin upstream && git checkout -b migration/phase-1
cd /f/label/lingshu-web && git remote rename origin upstream && git checkout -b migration/phase-1
cd /f/label/lingshu-backend && git status --short | head
```

Expected: 两个仓库 `git branch --show-current` 输出 `migration/phase-1`；`git remote -v` 只有 `upstream`；工作区干净（`.idea/`、`target/` 已被 gitignore）。

- [ ] **Step 2: 用临时 Maven 容器生成 Wrapper（本机无 Maven）**

```bash
cd /f/label/lingshu-backend
docker run --rm -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app maven:3.9.9-eclipse-temurin-17 \
  mvn -q -N wrapper:wrapper -Dmaven=3.9.9 -Dtype=only-script
ls -la mvnw mvnw.cmd .mvn/wrapper/maven-wrapper.properties
```

若本机 docker.io 拉取失败，备选：`winget install --id Apache.Maven` 后执行 `mvn -N wrapper:wrapper -Dmaven=3.9.9 -Dtype=only-script`。

Expected: 三个文件存在；`.mvn/wrapper/maven-wrapper.properties` 含 `distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip`。

- [ ] **Step 3: 验证 Wrapper 可用并能编译**

```bash
cd /f/label/lingshu-backend && chmod +x mvnw && ./mvnw -v && ./mvnw -q -DskipTests compile
```

Expected: 打印 `Apache Maven 3.9.9` 与本机 JDK 21；`compile` 成功（`BUILD SUCCESS` 或静默返回 0）。

- [ ] **Step 4: 提交**

```bash
cd /f/label/lingshu-backend
git add mvnw mvnw.cmd .mvn/wrapper/maven-wrapper.properties
git commit -m "build(maven): add maven wrapper

引入 Maven Wrapper（only-script 类型，固定 Maven 3.9.9），
使本机与 CI 无需预装 Maven 即可构建，消除环境差异。"
```

---

### Task 1: 环境变量契约（报告 1.1）

**Files:**
- Modify: `src/main/resources/application.yml`
- Create: `deploy/.env.example`, `.env`（本地，不提交）
- Modify: `.gitignore`
- Test: `src/test/java/com/onlyactwo/lingshu/infrastructure/config/ApplicationYmlSecretGuardTest.java`

**Interfaces:**
- Produces: 环境变量名 `LINGSHU_MYSQL_*`、`LINGSHU_REDIS_*`、`LINGSHU_ROCKETMQ_NAMESERVER`、`LINGSHU_JWT_SECRET`、`LINGSHU_JWT_EXPIRE_SECONDS`、`LINGSHU_ADMIN_INITIAL_PASSWORD`、`LINGSHU_CORS_ALLOWED_ORIGINS`、`LINGSHU_OSS_PROVIDER`、`LINGSHU_S3_*`、`LINGSHU_RATE_LIMIT_*`；仓库根 `.env` 同时被 Spring（`spring.config.import`）与 docker compose（`--env-file .env`）读取。

- [ ] **Step 1: 写守卫测试（纯 JUnit，不起 Spring）**

```java
package com.onlyactwo.lingshu.infrastructure.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 守卫：application.yml 不得含真实口令，password 类配置项不得带默认值。
 */
class ApplicationYmlSecretGuardTest {

    private static final Pattern PLACEHOLDER_WITHOUT_DEFAULT = Pattern.compile(".*\\$\\{[A-Z0-9_]+}\\s*$");

    @Test
    @DisplayName("application.yml 不含已知泄露口令")
    void noLeakedPassword() throws IOException {
        String yml = readYml();
        assertThat(yml).doesNotContain("lzx2005");
    }

    @Test
    @DisplayName("password 配置项只能是无默认值的占位符")
    void passwordKeysHaveNoDefault() throws IOException {
        List<String> passwordLines = readYml().lines()
                .filter(line -> line.trim().startsWith("password:"))
                .toList();
        assertThat(passwordLines).isNotEmpty();
        for (String line : passwordLines) {
            assertThat(line).matches(PLACEHOLDER_WITHOUT_DEFAULT);
        }
    }

    private String readYml() throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/application.yml")) {
            assertThat(in).isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

}
```

- [ ] **Step 2: 运行，确认失败**

Run: `./mvnw -q test -Dtest=ApplicationYmlSecretGuardTest`
Expected: FAIL，`noLeakedPassword` 断言 `doesNotContain("lzx2005")` 失败。

- [ ] **Step 3: 重写 `application.yml`**

整文件替换为：

```yaml
server:
  port: ${LINGSHU_SERVER_PORT:8080}
  forward-headers-strategy: native

spring:
  application:
    name: lingshu
  config:
    import: optional:file:./.env[.properties]
  datasource:
    url: jdbc:mysql://${LINGSHU_MYSQL_HOST:127.0.0.1}:${LINGSHU_MYSQL_PORT:3306}/${LINGSHU_MYSQL_DB:lingshu}?useUnicode=true&characterEncoding=utf-8&serverTimezone=Asia/Shanghai
    username: ${LINGSHU_MYSQL_USERNAME:root}
    password: ${LINGSHU_MYSQL_PASSWORD}
    driver-class-name: com.mysql.cj.jdbc.Driver
  data:
    redis:
      host: ${LINGSHU_REDIS_HOST:127.0.0.1}
      port: ${LINGSHU_REDIS_PORT:6379}
      password: ${LINGSHU_REDIS_PASSWORD}

rocketmq:
  name-server: ${LINGSHU_ROCKETMQ_NAMESERVER:127.0.0.1:9876}
  producer:
    group: lingshu-producer

mybatis-plus:
  mapper-locations: classpath*:/mapper/**/*.xml
  configuration:
    map-underscore-to-camel-case: true
```

说明：`spring.config.import` 让根目录 `.env`（`KEY=value` 行）作为属性源加载，`${LINGSHU_MYSQL_PASSWORD}` 直接从中解析；缺失时启动报 `Could not resolve placeholder 'LINGSHU_MYSQL_PASSWORD'`，这是期望行为。

- [ ] **Step 4: 创建 `deploy/.env.example` 与本地 `.env`**

`deploy/.env.example`（提交）：

```properties
# 复制为仓库根 .env 后按需修改。所有口令仅用于本地 compose，切勿用于生产。
LINGSHU_SERVER_PORT=8080

LINGSHU_MYSQL_HOST=127.0.0.1
LINGSHU_MYSQL_PORT=3306
LINGSHU_MYSQL_DB=lingshu
LINGSHU_MYSQL_USERNAME=root
LINGSHU_MYSQL_PASSWORD=lingshu_dev_pwd

LINGSHU_REDIS_HOST=127.0.0.1
LINGSHU_REDIS_PORT=6379
LINGSHU_REDIS_PASSWORD=lingshu_dev_pwd

LINGSHU_ROCKETMQ_NAMESERVER=127.0.0.1:9876

# 首启写入 sys_config，之后修改无效。生产用 openssl rand -base64 48 生成。
LINGSHU_JWT_SECRET=dev-only-jwt-secret-please-change-0123456789abcdef
LINGSHU_JWT_EXPIRE_SECONDS=86400
# 仅当 admin 账号不存在时使用。
LINGSHU_ADMIN_INITIAL_PASSWORD=admin123456

# 逗号分隔的前端来源。
LINGSHU_CORS_ALLOWED_ORIGINS=http://localhost:5173

# 对象存储：s3（MinIO / AWS）或 tos（火山，配置在 sys_config.tos.config）。
LINGSHU_OSS_PROVIDER=s3
LINGSHU_S3_ENDPOINT=http://127.0.0.1:9000
LINGSHU_S3_REGION=us-east-1
LINGSHU_S3_ACCESS_KEY=lingshu-minio
LINGSHU_S3_SECRET_KEY=lingshu_dev_pwd
LINGSHU_S3_BUCKET=lingshu
LINGSHU_S3_PUBLIC_BASE_URL=

LINGSHU_RATE_LIMIT_GLOBAL_PER_MINUTE=600
LINGSHU_RATE_LIMIT_LOGIN_MAX_FAILURES=5
LINGSHU_RATE_LIMIT_LOGIN_WINDOW_MINUTES=15
```

本地：

```bash
cd /f/label/lingshu-backend && cp deploy/.env.example .env
```

- [ ] **Step 5: `.gitignore` 追加**

在 `# Local config` 段末尾追加两行：

```gitignore
.env
.env.*.local
```

- [ ] **Step 6: 运行守卫测试，确认通过**

Run: `./mvnw -q test -Dtest=ApplicationYmlSecretGuardTest`
Expected: PASS（2 tests）。

- [ ] **Step 7: 确认 `.env` 不会被提交，然后提交**

```bash
git status --short   # 不应出现 .env
git add src/main/resources/application.yml deploy/.env.example .gitignore \
  src/test/java/com/onlyactwo/lingshu/infrastructure/config/ApplicationYmlSecretGuardTest.java
git commit -m "fix(config): remove default credentials from application.yml

数据库与 Redis 口令不再有默认值，缺失即启动失败；通过
spring.config.import 读取仓库根 .env，并提供 deploy/.env.example
作为环境变量契约。新增守卫测试防止口令回流。
此后本地启动前必须先复制 .env.example 为 .env。"
```

---

### Task 2: 本地中间件 docker compose（报告 1.4）

**Files:**
- Create: `deploy/docker-compose.yml`, `deploy/rocketmq/broker.conf`

**Interfaces:**
- Consumes: Task 1 的 `.env` 变量。
- Produces: 宿主机可达的 MySQL `127.0.0.1:3306`（库 `lingshu`，`utf8mb4_general_ci`）、Redis `6379`、RocketMQ namesrv `9876` + broker `10911`、MinIO API `9000` / 控制台 `9001`，桶 `lingshu` 已建且匿名可下载。

- [ ] **Step 1: 写 `deploy/rocketmq/broker.conf`**

```properties
brokerClusterName=DefaultCluster
brokerName=broker-a
brokerId=0
deleteWhen=04
fileReservedTime=48
brokerRole=ASYNC_MASTER
flushDiskType=ASYNC_FLUSH
listenPort=10911
# 宿主机上的 Java 客户端通过 namesrv 拿到的 broker 地址必须是宿主机可达地址（Docker Desktop 的坑）。
brokerIP1=127.0.0.1
namesrvAddr=namesrv:9876
autoCreateTopicEnable=true
autoCreateSubscriptionGroup=true
```

- [ ] **Step 2: 写 `deploy/docker-compose.yml`**

```yaml
name: lingshu

services:
  mysql:
    image: mysql:8.0
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_general_ci
      - --default-time-zone=+08:00
    environment:
      MYSQL_ROOT_PASSWORD: ${LINGSHU_MYSQL_PASSWORD}
      MYSQL_DATABASE: ${LINGSHU_MYSQL_DB:-lingshu}
    ports:
      - "${LINGSHU_MYSQL_PORT:-3306}:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -p$$MYSQL_ROOT_PASSWORD --silent"]
      interval: 5s
      timeout: 5s
      retries: 30

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--requirepass", "${LINGSHU_REDIS_PASSWORD}"]
    ports:
      - "${LINGSHU_REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a \"$${REDIS_PASSWORD}\" ping | grep -q PONG"]
      interval: 5s
      timeout: 3s
      retries: 20
    environment:
      REDIS_PASSWORD: ${LINGSHU_REDIS_PASSWORD}

  namesrv:
    image: apache/rocketmq:5.3.1
    command: sh mqnamesrv
    environment:
      JAVA_OPT_EXT: "-Xms256m -Xmx256m -Xmn128m"
    ports:
      - "9876:9876"
    healthcheck:
      test: ["CMD-SHELL", "sh mqadmin clusterList -n 127.0.0.1:9876 >/dev/null 2>&1"]
      interval: 5s
      timeout: 10s
      retries: 20

  broker:
    image: apache/rocketmq:5.3.1
    command: sh mqbroker -c /home/rocketmq/conf/broker.conf
    depends_on:
      namesrv:
        condition: service_healthy
    environment:
      JAVA_OPT_EXT: "-Xms512m -Xmx512m -Xmn256m"
    ports:
      - "10909:10909"
      - "10911:10911"
      - "10912:10912"
    volumes:
      - ./rocketmq/broker.conf:/home/rocketmq/conf/broker.conf:ro
      - rocketmq-store:/home/rocketmq/store
    healthcheck:
      test: ["CMD-SHELL", "sh mqadmin clusterList -n namesrv:9876 2>/dev/null | grep -q broker-a"]
      interval: 5s
      timeout: 10s
      retries: 30

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${LINGSHU_S3_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${LINGSHU_S3_SECRET_KEY}
      # 浏览器预签名直传需要 MinIO 放行前端来源。
      MINIO_API_CORS_ALLOW_ORIGIN: ${LINGSHU_CORS_ALLOWED_ORIGINS:-http://localhost:5173}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 20

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    environment:
      MINIO_ROOT_USER: ${LINGSHU_S3_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${LINGSHU_S3_SECRET_KEY}
      BUCKET: ${LINGSHU_S3_BUCKET:-lingshu}
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 $$MINIO_ROOT_USER $$MINIO_ROOT_PASSWORD &&
      mc mb --ignore-existing local/$$BUCKET &&
      mc anonymous set download local/$$BUCKET &&
      echo '[minio-init] bucket ready'
      "

volumes:
  mysql-data:
  rocketmq-store:
  minio-data:
```

- [ ] **Step 3: 启动并等待全部健康**

```bash
cd /f/label/lingshu-backend
docker compose --env-file .env -f deploy/docker-compose.yml up -d --wait
docker compose --env-file .env -f deploy/docker-compose.yml ps
```

Expected: `mysql`、`redis`、`namesrv`、`broker`、`minio` 状态 `healthy`；`minio-init` 状态 `exited (0)`。若 broker 一直不健康，`docker compose ... logs broker` 查看是否内存不足（Docker Desktop 需 ≥ 4 GB）。

- [ ] **Step 4: 逐项连通性验证（宿主机视角）**

```bash
docker compose --env-file .env -f deploy/docker-compose.yml exec mysql \
  sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT @@character_set_database, @@collation_database" lingshu'
docker compose --env-file .env -f deploy/docker-compose.yml exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD" ping'
docker compose --env-file .env -f deploy/docker-compose.yml exec broker sh mqadmin clusterList -n namesrv:9876
curl -fsS http://127.0.0.1:9000/minio/health/live -o /dev/null -w '%{http_code}\n'
```

Expected: `utf8mb4 utf8mb4_general_ci`；`PONG`；clusterList 中 `broker-a` 的地址为 `127.0.0.1:10911`；MinIO 返回 `200`。

- [ ] **Step 5: 提交**

```bash
git add deploy/docker-compose.yml deploy/rocketmq/broker.conf
git commit -m "build(deploy): add docker compose for local middleware

提供 MySQL 8（utf8mb4_general_ci）、Redis 7、RocketMQ 5 namesrv/broker、
MinIO 及桶初始化的一键编排，替代原先手工 SSH 隧道到线上中间件的方式。
broker.conf 固定 brokerIP1=127.0.0.1 以适配 Docker Desktop。"
```

---

### Task 3: Flyway 与 V1 初始化 DDL（报告 1.5）

**Files:**
- Modify: `pom.xml`（dependencies）
- Modify: `src/main/resources/application.yml`（追加 `spring.flyway`）
- Create: `src/main/resources/db/migration/V1__init.sql`
- Test: `src/test/java/com/onlyactwo/lingshu/infrastructure/db/FlywayMigrationTest.java`

**Interfaces:**
- Consumes: Task 2 的 MySQL。
- Produces: 11 张表；`flyway_schema_history` 当前版本 `1`；后续阶段的 `V2__mq_outbox.sql` 等按 Flyway 命名规则追加。

- [ ] **Step 1: 写测试**

```java
package com.onlyactwo.lingshu.infrastructure.db;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class FlywayMigrationTest {

    private static final List<String> EXPECTED_TABLES = List.of(
            "sys_user", "workspace", "user_workspace_ship", "sys_config",
            "lingshu_label_tool", "lingshu_dataset", "lingshu_dataset_version", "lingshu_dataset_sample",
            "label_case", "label_task_group", "label_task");

    @Autowired
    private Flyway flyway;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("Flyway 当前版本为 1，且 11 张表存在")
    void migrated_toV1_withAllTables() {
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("1");
        List<String> tables = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()", String.class);
        assertThat(tables).containsAll(EXPECTED_TABLES);
    }

    @Test
    @DisplayName("label_task 上存在幂等唯一索引 uk_case_type_sample")
    void labelTask_hasIdempotencyUniqueIndex() {
        Integer nonUnique = jdbcTemplate.queryForObject(
                "SELECT MIN(non_unique) FROM information_schema.statistics "
                        + "WHERE table_schema = DATABASE() AND table_name = 'label_task' AND index_name = 'uk_case_type_sample'",
                Integer.class);
        assertThat(nonUnique).isEqualTo(0);
    }

}
```

- [ ] **Step 2: 运行，确认失败**

Run: `./mvnw -q test -Dtest=FlywayMigrationTest`
Expected: FAIL，`No qualifying bean of type 'org.flywaydb.core.Flyway'`。

- [ ] **Step 3: pom.xml 增加依赖（放在 `mysql-connector-j` 之后）**

```xml
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-core</artifactId>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-mysql</artifactId>
        </dependency>
```

- [ ] **Step 4: application.yml 的 `spring:` 节下追加**

```yaml
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
    baseline-version: 1
    baseline-description: existing-schema
```

含义：空库 → 执行 `V1`；已有表但无 `flyway_schema_history` 的老库（灵枢原线上库）→ 记 baseline=1、跳过 `V1`，从 `V2` 起生效。

- [ ] **Step 5: 写 `src/main/resources/db/migration/V1__init.sql`**

```sql
-- 灵枢初始表结构（由 PO / Mapper XML / 仓储查询条件反推；上线前务必与线上 mysqldump --no-data 对比，见迁移报告 R3）。
-- 时间戳统一毫秒 BIGINT；json 列存 MyBatis 写入的 JSON 字符串。

CREATE TABLE sys_user (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    username        VARCHAR(32)  NOT NULL,
    display_name    VARCHAR(64)  NOT NULL DEFAULT '',
    password_hash   VARCHAR(128) NOT NULL,
    is_system_admin TINYINT(1)   NOT NULL DEFAULT 0,
    status          INT          NOT NULL DEFAULT 0 COMMENT '0 NORMAL / 1 DISABLED',
    creator         VARCHAR(64)  NULL,
    operator        VARCHAR(64)  NULL,
    create_time     BIGINT       NOT NULL,
    update_time     BIGINT       NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_username (username)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;

CREATE TABLE workspace (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    space_code  VARCHAR(32)  NOT NULL,
    name        VARCHAR(128) NOT NULL,
    description VARCHAR(512) NULL,
    creator     VARCHAR(64)  NULL,
    operator    VARCHAR(64)  NULL,
    create_time BIGINT       NOT NULL,
    update_time BIGINT       NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_space_code (space_code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;

CREATE TABLE user_workspace_ship (
    id            BIGINT      NOT NULL AUTO_INCREMENT,
    workspace_id  BIGINT      NOT NULL,
    user_id       BIGINT      NOT NULL,
    role_in_space INT         NOT NULL COMMENT '1 LABELER / 2 REVIEWER / 3 LABEL_ADMIN',
    creator       VARCHAR(64) NULL,
    create_time   BIGINT      NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ws_user_role (workspace_id, user_id, role_in_space),
    KEY idx_user (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;

CREATE TABLE sys_config (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    config_key  VARCHAR(128) NOT NULL,
    config_name VARCHAR(128) NOT NULL DEFAULT '',
    type        INT          NOT NULL COMMENT '1 STRING / 2 JSON / 3 YAML / 4 CLASS_PATH',
    content     LONGTEXT     NULL,
    description VARCHAR(512) NULL,
    deleted     INT          NOT NULL DEFAULT 0,
    creator     VARCHAR(64)  NULL,
    operator    VARCHAR(64)  NULL,
    create_time BIGINT       NOT NULL,
    update_time BIGINT       NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_config_key (config_key)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;

CREATE TABLE lingshu_label_tool (
    id                     BIGINT       NOT NULL AUTO_INCREMENT,
    label_tool_code        VARCHAR(64)  NOT NULL,
    label_tool_name        VARCHAR(128) NOT NULL,
    label_tool_type        INT          NOT NULL COMMENT '1 BUILTIN / 2 IFRAME',
    label_tool_url         VARCHAR(1024) NULL,
    label_tool_json_schema JSON         NULL,
    label_tool_page_schema JSON         NULL,
    deleted                INT          NOT NULL DEFAULT 0,
    ext                    TEXT         NULL,
    creator                VARCHAR(64)  NULL,
    operator               VARCHAR(64)  NULL,
    create_time            BIGINT       NOT NULL,
    update_time            BIGINT       NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_code (label_tool_code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;

CREATE TABLE lingshu_dataset (
    id                    BIGINT       NOT NULL AUTO_INCREMENT,
    space_code            VARCHAR(32)  NOT NULL,
    dataset_name          VARCHAR(128) NOT NULL,
    dataset_desc          VARCHAR(512) NULL,
    dataset_type          INT          NOT NULL COMMENT '1 ANNOTATION / 2 STREAM_ANNOTATION / 3 RESULT',
    service_obj_name      VARCHAR(64)  NULL COMMENT 'labelToolCode',
    latest_version_number INT          NOT NULL DEFAULT 0,
    deleted               INT          NOT NULL DEFAULT 0,
    ext                   TEXT         NULL,
    creator               VARCHAR(64)  NULL,
    operator              VARCHAR(64)  NULL,
    create_time           BIGINT       NOT NULL,
    update_time           BIGINT       NOT NULL,
    PRIMARY KEY (id),
    KEY idx_space_name (space_code, dataset_name, deleted)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;

CREATE TABLE lingshu_dataset_version (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    dataset_id     BIGINT       NOT NULL,
    version_number INT          NOT NULL,
    version_desc   VARCHAR(512) NULL,
    oss_path       VARCHAR(512) NULL,
    upload_status  INT          NOT NULL COMMENT '1 PARSING / 2 READY / 3 PARSE_FAILED',
    sample_count   BIGINT       NOT NULL DEFAULT 0,
    deleted        INT          NOT NULL DEFAULT 0,
    ext            JSON         NULL,
    creator        VARCHAR(64)  NULL,
    operator       VARCHAR(64)  NULL,
    create_time    BIGINT       NOT NULL,
    update_time    BIGINT       NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_dataset_version (dataset_id, version_number)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;

CREATE TABLE lingshu_dataset_sample (
    id                 BIGINT      NOT NULL AUTO_INCREMENT,
    dataset_version_id BIGINT      NOT NULL,
    biz_id             VARCHAR(64) NOT NULL,
    sample_data_json   JSON        NULL,
    deleted            INT         NOT NULL DEFAULT 0,
    ext                TEXT        NULL,
    creator            VARCHAR(64) NULL,
    operator           VARCHAR(64) NULL,
    create_time        BIGINT      NOT NULL,
    update_time        BIGINT      NOT NULL,
    PRIMARY KEY (id),
    KEY idx_version_biz (dataset_version_id, biz_id),
    KEY idx_version_id (dataset_version_id, id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;

CREATE TABLE label_case (
    id                              BIGINT        NOT NULL AUTO_INCREMENT,
    space_code                      VARCHAR(32)   NOT NULL,
    name                            VARCHAR(255)  NOT NULL,
    description                     VARCHAR(1024) NULL,
    data_source_type                INT           NOT NULL COMMENT '1 DATASET / 2 STREAM',
    dataset_version_id              BIGINT        NULL,
    label_result_dataset_version_id BIGINT        NULL,
    label_tool_code                 VARCHAR(64)   NOT NULL,
    task_plan_config                JSON          NULL,
    assignment_config               JSON          NULL,
    status                          INT           NOT NULL COMMENT '1 NOT_STARTED / 2 RUNNING / 3 PAUSED / 4 FINISHED',
    version                         BIGINT        NOT NULL DEFAULT 0,
    deleted                         INT           NOT NULL DEFAULT 0,
    ext                             JSON          NULL,
    creator                         VARCHAR(64)   NULL,
    operator                        VARCHAR(64)   NULL,
    create_time                     BIGINT        NOT NULL,
    update_time                     BIGINT        NOT NULL,
    PRIMARY KEY (id),
    KEY idx_space_status (space_code, deleted, status),
    KEY idx_space_name (space_code, name, deleted)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;

CREATE TABLE label_task_group (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    case_id         BIGINT       NOT NULL,
    stage           INT          NOT NULL,
    type            INT          NOT NULL COMMENT '1 PERSONAL / 2..6 各阶段池',
    annotator       VARCHAR(64)  NULL,
    name            VARCHAR(255) NULL,
    label_tool_code VARCHAR(64)  NULL,
    status          INT          NOT NULL COMMENT '1 PENDING / 2 RUNNING / 3 DONE',
    total_count     BIGINT       NOT NULL DEFAULT 0,
    done_count      BIGINT       NOT NULL DEFAULT 0,
    cost_time       BIGINT       NOT NULL DEFAULT 0,
    ext             TEXT         NULL,
    create_time     BIGINT       NOT NULL,
    update_time     BIGINT       NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_case_type_stage_annotator (case_id, type, stage, annotator),
    KEY idx_annotator_stage (annotator, type, stage)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;

CREATE TABLE label_task (
    id             BIGINT      NOT NULL AUTO_INCREMENT,
    case_id        BIGINT      NOT NULL,
    task_group_id  BIGINT      NOT NULL,
    task_group_seq INT         NOT NULL DEFAULT 0,
    task_type      INT         NOT NULL COMMENT '1 AI_LABEL / 2 LABEL / 3 AI_REVIEW / 4 FIRST_CHECK / 5 RECHECK',
    status         INT         NOT NULL COMMENT '1 PENDING_DISPATCH / 2 LABELING / 3 REVIEWING / 4 DONE / 5 REWORK',
    round          INT         NOT NULL DEFAULT 1,
    data_sample_id BIGINT      NOT NULL,
    biz_id         VARCHAR(64) NULL,
    annotator      VARCHAR(64) NULL,
    claim_time     BIGINT      NULL,
    cost_time      BIGINT      NULL,
    ext            JSON        NULL,
    operator       VARCHAR(64) NULL,
    create_time    BIGINT      NOT NULL,
    update_time    BIGINT      NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_case_type_sample (case_id, task_type, data_sample_id),
    KEY idx_group_status_seq (task_group_id, status, task_group_seq),
    KEY idx_annotator_status (annotator, status, task_type),
    KEY idx_claim_time (claim_time)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;
```

- [ ] **Step 6: 运行迁移测试，确认通过**

Run: `./mvnw -q test -Dtest=FlywayMigrationTest`
Expected: PASS（2 tests）。日志中出现 `Successfully applied 1 migration to schema "lingshu"`。

- [ ] **Step 7: 跑全部既有集成测试，确认 DDL 与代码一致（此时 TOS 相关 3 个测试和 init 下 2 个测试预期失败/跳过，其余应全绿）**

Run: `./mvnw test -Dtest='!TosClientTest,!FileParseDomainServiceTest,!ExportCaseResultDomainServiceTest,!GetUploadPreSignedUrlDomainServiceTest,!SystemAdminInitTest,!FixLabelToolSchemaTest' 2>&1 | tail -40`
Expected: `Tests run: N, Failures: 0, Errors: 0`。若出现 `Unknown column` 或 `Data too long`，以报错为准修正 `V1__init.sql`（改列名/加长度），并用 `docker compose --env-file .env -f deploy/docker-compose.yml down -v && ... up -d --wait` 重置库后重跑。

- [ ] **Step 8: 提交**

```bash
git add pom.xml src/main/resources/application.yml src/main/resources/db/migration/V1__init.sql \
  src/test/java/com/onlyactwo/lingshu/infrastructure/db/FlywayMigrationTest.java
git commit -m "feat(db): manage schema with flyway and add V1 init migration

仓库此前没有任何 DDL，表结构只存在于线上库。引入 Flyway 并按 PO、
Mapper XML 与仓储查询条件反推出 11 张表的初始迁移，含派发幂等唯一索引
uk_case_type_sample。baseline-on-migrate=1 保证已有库跳过 V1。
风险：反推结构可能与线上不一致，上线前需与 mysqldump --no-data 对比。"
```

---

### Task 4: 首启引导 SystemBootstrapRunner（报告 1.6）

**Files:**
- Create: `src/main/java/com/onlyactwo/lingshu/infrastructure/bootstrap/BootstrapProperties.java`
- Create: `src/main/java/com/onlyactwo/lingshu/infrastructure/bootstrap/SystemBootstrapRunner.java`
- Modify: `src/main/java/com/onlyactwo/lingshu/LingShuApplication.java`（加 `@ConfigurationPropertiesScan`）
- Modify: `src/main/resources/application.yml`（追加 `lingshu.bootstrap`）
- Delete: `src/test/java/com/onlyactwo/lingshu/init/SystemAdminInitTest.java`, `src/test/java/com/onlyactwo/lingshu/init/FixLabelToolSchemaTest.java`
- Test: `src/test/java/com/onlyactwo/lingshu/infrastructure/bootstrap/SystemBootstrapRunnerTest.java`

**Interfaces:**
- Consumes: `SysConfigDomainService.getContentOrNull(String)` / `saveOrUpdate(String key, String name, SysConfigTypeEnum type, String content, String operator)`；`UserRepository.selectByUsername(String)` / `save(UserDO)`；`PasswordEncoder`；`JwtUtil.CONFIG_KEY_JWT_SECRET`、`JwtUtil.CONFIG_KEY_JWT_EXPIRE_SECONDS`。
- Produces: 应用启动后 `sys_config` 必有 `jwt.secret`、`jwt.expireSeconds`，`sys_user` 必有 `admin`；`@ConfigurationPropertiesScan` 使后续 `CorsProperties`、`S3Properties`、`RateLimitProperties` 只需 `@ConfigurationProperties` 注解即可生效。

- [ ] **Step 1: 写测试**

```java
package com.onlyactwo.lingshu.infrastructure.bootstrap;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.onlyactwo.lingshu.domain.config.service.SysConfigDomainService;
import com.onlyactwo.lingshu.domain.user.model.UserDO;
import com.onlyactwo.lingshu.infrastructure.jwt.JwtUtil;
import com.onlyactwo.lingshu.mapper.UserMapper;
import com.onlyactwo.lingshu.po.UserPO;
import com.onlyactwo.lingshu.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class SystemBootstrapRunnerTest {

    @Autowired
    private SystemBootstrapRunner runner;

    @Autowired
    private SysConfigDomainService sysConfigDomainService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserMapper userMapper;

    @Test
    @DisplayName("上下文启动后 jwt.secret / jwt.expireSeconds / admin 已就绪")
    void contextStartup_writesJwtConfigAndAdmin() {
        assertThat(sysConfigDomainService.get(JwtUtil.CONFIG_KEY_JWT_SECRET)).hasSizeGreaterThanOrEqualTo(32);
        assertThat(Long.parseLong(sysConfigDomainService.get(JwtUtil.CONFIG_KEY_JWT_EXPIRE_SECONDS))).isPositive();

        UserDO admin = userRepository.selectByUsername(SystemBootstrapRunner.ADMIN_USERNAME);
        assertThat(admin).isNotNull();
        assertThat(admin.getIsSystemAdmin()).isTrue();
    }

    @Test
    @DisplayName("重复执行幂等：密钥不变、admin 不重复")
    void rerun_isIdempotent() {
        String secretBefore = sysConfigDomainService.get(JwtUtil.CONFIG_KEY_JWT_SECRET);
        long adminCountBefore = userMapper.selectCount(
                Wrappers.<UserPO>lambdaQuery().eq(UserPO::getUsername, SystemBootstrapRunner.ADMIN_USERNAME));

        runner.run(null);

        assertThat(sysConfigDomainService.get(JwtUtil.CONFIG_KEY_JWT_SECRET)).isEqualTo(secretBefore);
        assertThat(userMapper.selectCount(
                Wrappers.<UserPO>lambdaQuery().eq(UserPO::getUsername, SystemBootstrapRunner.ADMIN_USERNAME)))
                .isEqualTo(adminCountBefore).isEqualTo(1L);
    }

}
```

- [ ] **Step 2: 运行，确认失败**

Run: `./mvnw -q test -Dtest=SystemBootstrapRunnerTest`
Expected: 编译失败，`cannot find symbol: class SystemBootstrapRunner`。

- [ ] **Step 3: 写 `BootstrapProperties`**

```java
package com.onlyactwo.lingshu.infrastructure.bootstrap;

import lombok.Data;
import lombok.ToString;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 首启引导参数，来自环境变量（见 deploy/.env.example）。仅在对应数据不存在时使用。
 */
@Data
@ConfigurationProperties(prefix = "lingshu.bootstrap")
public class BootstrapProperties {

    /** 首启写入 sys_config.jwt.secret；HS256 要求 ≥ 32 字节。 */
    @ToString.Exclude
    private String jwtSecret;

    /** 首启写入 sys_config.jwt.expireSeconds。 */
    private long jwtExpireSeconds = 86400L;

    /** 首启创建 admin 的明文密码；创建后不再使用。 */
    @ToString.Exclude
    private String adminInitialPassword;

}
```

- [ ] **Step 4: 写 `SystemBootstrapRunner`**

```java
package com.onlyactwo.lingshu.infrastructure.bootstrap;

import com.onlyactwo.lingshu.domain.config.model.SysConfigTypeEnum;
import com.onlyactwo.lingshu.domain.config.service.SysConfigDomainService;
import com.onlyactwo.lingshu.domain.user.model.UserDO;
import com.onlyactwo.lingshu.domain.user.model.UserStatusEnum;
import com.onlyactwo.lingshu.infrastructure.jwt.JwtUtil;
import com.onlyactwo.lingshu.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 首启引导：幂等写入 JWT 配置与系统管理员。替代原先靠运行测试类 SystemAdminInitTest 落库的做法。
 *
 * <p>每次启动都执行，但只在目标数据缺失时写入；缺失且未提供环境变量时直接让启动失败（fail fast）。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SystemBootstrapRunner implements ApplicationRunner {

    static final String ADMIN_USERNAME = "admin";
    static final String ADMIN_DISPLAY_NAME = "系统管理员";
    static final String SYSTEM_OPERATOR = "SYSTEM";
    private static final int MIN_SECRET_LENGTH = 32;
    private static final int MIN_PASSWORD_LENGTH = 6;

    private final BootstrapProperties properties;
    private final SysConfigDomainService sysConfigDomainService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(ApplicationArguments args) {
        bootstrapJwtConfig();
        bootstrapAdmin();
    }

    private void bootstrapJwtConfig() {
        if (sysConfigDomainService.getContentOrNull(JwtUtil.CONFIG_KEY_JWT_SECRET) == null) {
            String secret = properties.getJwtSecret();
            if (!StringUtils.hasText(secret) || secret.length() < MIN_SECRET_LENGTH) {
                throw new IllegalStateException(
                        "首次启动需设置 LINGSHU_JWT_SECRET（至少 32 字符，可用 openssl rand -base64 48 生成）");
            }
            sysConfigDomainService.saveOrUpdate(JwtUtil.CONFIG_KEY_JWT_SECRET, "JWT 签名密钥",
                    SysConfigTypeEnum.STRING, secret, SYSTEM_OPERATOR);
            log.info("[bootstrap] 已写入 sys_config.{}", JwtUtil.CONFIG_KEY_JWT_SECRET);
        }
        if (sysConfigDomainService.getContentOrNull(JwtUtil.CONFIG_KEY_JWT_EXPIRE_SECONDS) == null) {
            sysConfigDomainService.saveOrUpdate(JwtUtil.CONFIG_KEY_JWT_EXPIRE_SECONDS, "JWT 过期秒数",
                    SysConfigTypeEnum.STRING, String.valueOf(properties.getJwtExpireSeconds()), SYSTEM_OPERATOR);
            log.info("[bootstrap] 已写入 sys_config.{}={}", JwtUtil.CONFIG_KEY_JWT_EXPIRE_SECONDS,
                    properties.getJwtExpireSeconds());
        }
    }

    private void bootstrapAdmin() {
        if (userRepository.selectByUsername(ADMIN_USERNAME) != null) {
            return;
        }
        String password = properties.getAdminInitialPassword();
        if (!StringUtils.hasText(password) || password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalStateException("首次启动需设置 LINGSHU_ADMIN_INITIAL_PASSWORD（至少 6 位）");
        }
        long now = System.currentTimeMillis();
        Long id = userRepository.save(UserDO.builder()
                .username(ADMIN_USERNAME)
                .displayName(ADMIN_DISPLAY_NAME)
                .passwordHash(passwordEncoder.encode(password))
                .isSystemAdmin(true)
                .status(UserStatusEnum.NORMAL)
                .creator(SYSTEM_OPERATOR)
                .operator(SYSTEM_OPERATOR)
                .createTime(now)
                .updateTime(now)
                .build());
        log.info("[bootstrap] 已创建系统管理员 {}, id={}", ADMIN_USERNAME, id);
    }

}
```

- [ ] **Step 5: `LingShuApplication` 加注解，`application.yml` 加配置节**

`LingShuApplication.java` 在 `@SpringBootApplication` 下增加一行 `@ConfigurationPropertiesScan`（import `org.springframework.boot.context.properties.ConfigurationPropertiesScan`）。

`application.yml` 末尾追加顶层节：

```yaml
lingshu:
  bootstrap:
    jwt-secret: ${LINGSHU_JWT_SECRET:}
    jwt-expire-seconds: ${LINGSHU_JWT_EXPIRE_SECONDS:86400}
    admin-initial-password: ${LINGSHU_ADMIN_INITIAL_PASSWORD:}
```

- [ ] **Step 6: 删除两个初始化"测试"**

```bash
git rm src/test/java/com/onlyactwo/lingshu/init/SystemAdminInitTest.java \
       src/test/java/com/onlyactwo/lingshu/init/FixLabelToolSchemaTest.java
```

`FixLabelToolSchemaTest` 是一次性的数据修复脚本，历史库若仍需修复，从 git 历史 `git show upstream/main:src/test/java/com/onlyactwo/lingshu/init/FixLabelToolSchemaTest.java` 取回临时执行。

- [ ] **Step 7: 运行测试，确认通过**

Run: `./mvnw -q test -Dtest=SystemBootstrapRunnerTest`
Expected: PASS（2 tests）；日志含 `[bootstrap] 已写入 sys_config.jwt.secret` 与 `[bootstrap] 已创建系统管理员 admin`（仅首次）。

- [ ] **Step 8: 验证 fail-fast**

```bash
LINGSHU_JWT_SECRET= LINGSHU_ADMIN_INITIAL_PASSWORD= LINGSHU_MYSQL_DB=lingshu_empty_check ./mvnw -q spring-boot:run 2>&1 | grep -m1 "首次启动需设置" || echo "（已有库不会触发，属预期）"
```

说明：只有空库才会触发；上面命令若报 `Unknown database` 则表示占位符已正确覆盖，改用 `docker compose exec mysql mysql -uroot -p... -e "CREATE DATABASE lingshu_empty_check"` 后重跑观察 `IllegalStateException` 信息，验毕 `DROP DATABASE lingshu_empty_check`。

- [ ] **Step 9: 提交**

```bash
git add src/main/java/com/onlyactwo/lingshu/LingShuApplication.java \
  src/main/java/com/onlyactwo/lingshu/infrastructure/bootstrap \
  src/main/resources/application.yml \
  src/test/java/com/onlyactwo/lingshu/infrastructure/bootstrap/SystemBootstrapRunnerTest.java
git commit -m "feat(bootstrap): seed jwt config and admin on first startup

新增 SystemBootstrapRunner，在 sys_config 缺少 jwt.secret/jwt.expireSeconds
或 sys_user 缺少 admin 时从环境变量幂等写入，缺变量则启动失败。
删除依赖运行测试类落库的 SystemAdminInitTest 与一次性脚本
FixLabelToolSchemaTest。admin 初始密码不再固定为 admin。"
```

---

### Task 5: CORS 白名单（报告 1.2）

**Files:**
- Create: `src/main/java/com/onlyactwo/lingshu/infrastructure/web/config/CorsProperties.java`
- Modify: `src/main/java/com/onlyactwo/lingshu/infrastructure/web/config/CorsConfig.java`
- Modify: `src/main/resources/application.yml`（`lingshu.cors`）
- Test: `src/test/java/com/onlyactwo/lingshu/infrastructure/web/config/CorsConfigTest.java`

**Interfaces:**
- Consumes: Task 4 的 `@ConfigurationPropertiesScan`。
- Produces: `CorsProperties.getAllowedOrigins(): List<String>`；仅白名单来源可跨域，`allowCredentials=false`（鉴权走 Bearer，不需要 cookie）；暴露 `Retry-After` 响应头给前端（Task 8 用）。

- [ ] **Step 1: 写测试**

```java
package com.onlyactwo.lingshu.infrastructure.web.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "lingshu.cors.allowed-origins=http://allowed.example,http://second.example")
class CorsConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("白名单来源的预检：200 且回显来源，不带 credentials")
    void preflight_fromAllowedOrigin_ok() throws Exception {
        mockMvc.perform(options("/api/user/getCurrentUser")
                        .header(HttpHeaders.ORIGIN, "http://second.example")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://second.example"))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS));
    }

    @Test
    @DisplayName("非白名单来源的预检：403")
    void preflight_fromUnknownOrigin_forbidden() throws Exception {
        mockMvc.perform(options("/api/user/getCurrentUser")
                        .header(HttpHeaders.ORIGIN, "http://evil.example")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isForbidden());
    }

}
```

- [ ] **Step 2: 运行，确认失败**

Run: `./mvnw -q test -Dtest=CorsConfigTest`
Expected: `preflight_fromUnknownOrigin_forbidden` FAIL（现在任意来源都返回 200）。

- [ ] **Step 3: 写 `CorsProperties`**

```java
package com.onlyactwo.lingshu.infrastructure.web.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@Data
@ConfigurationProperties(prefix = "lingshu.cors")
public class CorsProperties {

    /** 允许的前端来源（完整 scheme://host[:port]），逗号分隔环境变量自动转 List。 */
    private List<String> allowedOrigins = List.of("http://localhost:5173");

}
```

- [ ] **Step 4: 改写 `CorsConfig`**

```java
package com.onlyactwo.lingshu.infrastructure.web.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

/**
 * 跨域白名单：只放行 {@link CorsProperties#getAllowedOrigins()}；鉴权用 Bearer，不开 credentials。
 *
 * <p>仍用 servlet 级 {@link CorsFilter}（先于拦截器，预检直接短路），避免 OPTIONS 被 AuthInterceptor 拦下。</p>
 */
@Configuration
@RequiredArgsConstructor
public class CorsConfig {

    private static final long PREFLIGHT_MAX_AGE_SECONDS = 3600L;

    private final CorsProperties corsProperties;

    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilterRegistration() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(corsProperties.getAllowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of(HttpHeaders.AUTHORIZATION, HttpHeaders.CONTENT_TYPE, HttpHeaders.ACCEPT));
        config.setExposedHeaders(List.of(HttpHeaders.RETRY_AFTER));
        config.setAllowCredentials(false);
        config.setMaxAge(PREFLIGHT_MAX_AGE_SECONDS);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        FilterRegistrationBean<CorsFilter> registration = new FilterRegistrationBean<>(new CorsFilter(source));
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

}
```

- [ ] **Step 5: `application.yml` 的 `lingshu:` 节追加**

```yaml
  cors:
    allowed-origins: ${LINGSHU_CORS_ALLOWED_ORIGINS:http://localhost:5173}
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `./mvnw -q test -Dtest=CorsConfigTest`
Expected: PASS（2 tests）。

- [ ] **Step 7: 提交**

```bash
git add src/main/java/com/onlyactwo/lingshu/infrastructure/web/config/CorsProperties.java \
  src/main/java/com/onlyactwo/lingshu/infrastructure/web/config/CorsConfig.java \
  src/main/resources/application.yml \
  src/test/java/com/onlyactwo/lingshu/infrastructure/web/config/CorsConfigTest.java
git commit -m "fix(web): restrict cors to configured origins

CORS 从任意来源 + 携带凭据改为 LINGSHU_CORS_ALLOWED_ORIGINS 白名单且
不开 credentials（鉴权走 Bearer，无需 cookie）。默认只放行本地 Vite
开发地址；生产需在 .env 中显式配置前端域名。"
```

---

### Task 6: 鉴权边界与 HTTP 状态码（报告 1.3 + F14）

**Files:**
- Modify: `src/main/java/com/onlyactwo/lingshu/infrastructure/web/config/WebMvcConfig.java`
- Create: `src/main/java/com/onlyactwo/lingshu/infrastructure/common/error/ErrorHttpStatus.java`
- Modify: `src/main/java/com/onlyactwo/lingshu/infrastructure/common/exception/GlobalExceptionHandler.java`
- Test: `src/test/java/com/onlyactwo/lingshu/infrastructure/common/error/ErrorHttpStatusTest.java`, `src/test/java/com/onlyactwo/lingshu/infrastructure/web/interceptor/AuthInterceptorStatusTest.java`

**Interfaces:**
- Produces: `ErrorHttpStatus.of(ErrorCode): HttpStatus`（UNAUTHORIZED→401、FORBIDDEN/PERMISSION_DENIED→403、TOO_MANY_REQUESTS→429、其他→200）；`GlobalExceptionHandler` 的三个 handler 返回 `ResponseEntity<LingShuServiceResponse<Void>>`；鉴权排除路径只剩 `/api/auth/login`、`/error`、`/actuator/**`。
- 前端影响：`shared/api/http.ts` 已对 HTTP 401 执行 `onUnauthorized()`，对其他非 2xx 用 `error.response.data.message` 弹 toast，因此 403/429 带原包络返回不需要前端改动。

- [ ] **Step 1: 写纯单元测试**

```java
package com.onlyactwo.lingshu.infrastructure.common.error;

import com.onlyactwo.lingshu.domain.user.model.UserErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;

class ErrorHttpStatusTest {

    @Test
    void mapsAuthAndRateLimitCodes() {
        assertThat(ErrorHttpStatus.of(CommonErrorCode.UNAUTHORIZED)).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(ErrorHttpStatus.of(CommonErrorCode.FORBIDDEN)).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(ErrorHttpStatus.of(UserErrorCode.PERMISSION_DENIED)).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(ErrorHttpStatus.of(CommonErrorCode.TOO_MANY_REQUESTS)).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void otherBusinessCodesStay200() {
        assertThat(ErrorHttpStatus.of(CommonErrorCode.PARAM_INVALID)).isEqualTo(HttpStatus.OK);
        assertThat(ErrorHttpStatus.of(UserErrorCode.LOGIN_FAILED)).isEqualTo(HttpStatus.OK);
        assertThat(ErrorHttpStatus.of(CommonErrorCode.SYSTEM_ERROR)).isEqualTo(HttpStatus.OK);
    }

}
```

- [ ] **Step 2: 写 MockMvc 测试**

```java
package com.onlyactwo.lingshu.infrastructure.web.interceptor;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AuthInterceptorStatusTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("无 token 访问受保护接口：HTTP 401 + code=UNAUTHORIZED")
    void noToken_401() throws Exception {
        mockMvc.perform(get("/api/user/getCurrentUser"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    @DisplayName("伪造 token：HTTP 401")
    void garbageToken_401() throws Exception {
        mockMvc.perform(get("/api/user/getCurrentUser")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer not.a.jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    @DisplayName("登录接口无需 token；错误口令仍是 HTTP 200 业务失败")
    void login_isPublic_andBusinessFailureStays200() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"no_such_user_x\",\"password\":\"whatever\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("LOGIN_FAILED"));
    }

    @Test
    @DisplayName("/api/auth/ 下除 login 外的路径不再豁免鉴权")
    void otherAuthPaths_requireToken() throws Exception {
        mockMvc.perform(get("/api/auth/anything-else"))
                .andExpect(status().isUnauthorized());
    }

}
```

- [ ] **Step 3: 运行，确认失败**

Run: `./mvnw -q test -Dtest='ErrorHttpStatusTest,AuthInterceptorStatusTest'`
Expected: `ErrorHttpStatusTest` 编译失败（类不存在）；修到能编译后 `noToken_401` 因返回 200 失败。

- [ ] **Step 4: 写 `ErrorHttpStatus`**

```java
package com.onlyactwo.lingshu.infrastructure.common.error;

import org.springframework.http.HttpStatus;

/**
 * 错误码 → HTTP 状态：仅鉴权、权限、限流三类映射为非 200，让前端拦截器能按状态码处理；
 * 其余业务失败沿用 200 + success=false 的既有约定，避免大面积改前端。
 */
public final class ErrorHttpStatus {

    private static final String PERMISSION_DENIED_CODE = "PERMISSION_DENIED";

    private ErrorHttpStatus() {
    }

    public static HttpStatus of(ErrorCode errorCode) {
        if (errorCode == CommonErrorCode.UNAUTHORIZED) {
            return HttpStatus.UNAUTHORIZED;
        }
        if (errorCode == CommonErrorCode.FORBIDDEN || PERMISSION_DENIED_CODE.equals(errorCode.getCode())) {
            return HttpStatus.FORBIDDEN;
        }
        if (errorCode == CommonErrorCode.TOO_MANY_REQUESTS) {
            return HttpStatus.TOO_MANY_REQUESTS;
        }
        return HttpStatus.OK;
    }

}
```

- [ ] **Step 5: 改写 `GlobalExceptionHandler`**

```java
package com.onlyactwo.lingshu.infrastructure.common.exception;

import com.onlyactwo.lingshu.infrastructure.common.error.CommonErrorCode;
import com.onlyactwo.lingshu.infrastructure.common.error.ErrorHttpStatus;
import com.onlyactwo.lingshu.infrastructure.common.response.LingShuServiceResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ServiceException.class)
    public ResponseEntity<LingShuServiceResponse<Void>> handleServiceException(ServiceException ex) {
        log.warn("ServiceException: code={}, message={}", ex.getErrorCode().getCode(), ex.getMessage());
        return ResponseEntity.status(ErrorHttpStatus.of(ex.getErrorCode()))
                .body(LingShuServiceResponse.fail(ex.getErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
    public ResponseEntity<LingShuServiceResponse<Void>> handleValidationException(BindException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(this::formatFieldError)
                .collect(Collectors.joining("; "));
        log.warn("Param validation failed: {}", message);
        return ResponseEntity.ok(LingShuServiceResponse.fail(CommonErrorCode.PARAM_INVALID, message));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<LingShuServiceResponse<Void>> handleException(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.ok(LingShuServiceResponse.fail(CommonErrorCode.SYSTEM_ERROR));
    }

    private String formatFieldError(FieldError fieldError) {
        return fieldError.getField() + ": " + fieldError.getDefaultMessage();
    }

}
```

- [ ] **Step 6: 收窄 `WebMvcConfig` 排除路径**

将 `excludePathPatterns(...)` 改为：

```java
                .excludePathPatterns(
                        "/api/auth/login",
                        "/error",
                        "/actuator/**"
                );
```

- [ ] **Step 7: 运行测试，确认通过**

Run: `./mvnw -q test -Dtest='ErrorHttpStatusTest,AuthInterceptorStatusTest'`
Expected: PASS（6 tests）。

- [ ] **Step 8: 提交**

```bash
git add src/main/java/com/onlyactwo/lingshu/infrastructure/common/error/ErrorHttpStatus.java \
  src/main/java/com/onlyactwo/lingshu/infrastructure/common/exception/GlobalExceptionHandler.java \
  src/main/java/com/onlyactwo/lingshu/infrastructure/web/config/WebMvcConfig.java \
  src/test/java/com/onlyactwo/lingshu/infrastructure/common/error/ErrorHttpStatusTest.java \
  src/test/java/com/onlyactwo/lingshu/infrastructure/web/interceptor/AuthInterceptorStatusTest.java
git commit -m "fix(web): return 401/403/429 for auth and rate limit failures

鉴权失败此前返回 HTTP 200 + success=false，前端只在 401 时跳登录，
导致 token 过期后页面不跳转。现按错误码映射 401/403/429，其余业务
失败保持 200 以兼容前端。同时把鉴权豁免从 /api/auth/** 收窄为
/api/auth/login。"
```

---

### Task 7: 对象存储抽象与 MinIO 实现（报告 1.7）

**Files:**
- Modify: `pom.xml`（AWS SDK BOM + `s3` + `url-connection-client`；surefire `excludedGroups`）
- Create: `src/main/java/com/onlyactwo/lingshu/adapter/oss/{ObjectStorageClient,PreSignedUrl,OssErrorCode,S3Properties,S3ObjectStorageClient}.java`
- Modify: `src/main/java/com/onlyactwo/lingshu/adapter/tos/TosClient.java`（实现接口、条件装配）；Delete: `adapter/tos/TosPreSignedUrl.java`
- Modify: `domain/dataset/service/impl/DatasetDomainServiceImpl.java`, `domain/dataset/service/impl/FileParseDomainServiceImpl.java`, `domain/task/service/impl/CaseExportDomainServiceImpl.java`
- Modify tests: `adapter/tos/TosClientTest.java`（`@Tag("external")`）、`domain/dataset/service/impl/FileParseDomainServiceTest.java`、`domain/task/service/impl/ExportCaseResultDomainServiceTest.java`（改用接口）
- Modify: `src/main/resources/application.yml`（`lingshu.oss`）
- Test: `src/test/java/com/onlyactwo/lingshu/adapter/oss/S3ObjectStorageClientTest.java`, `src/test/java/com/onlyactwo/lingshu/adapter/oss/S3ObjectStorageClientUrlTest.java`

**Interfaces:**
- Produces:
  ```java
  public interface ObjectStorageClient {
      String putObject(String key, InputStream content);      // 返回 etag
      byte[] getObject(String key);
      String getPublicDownloadUrl(String key);
      PreSignedUrl preSignedPutUrl(String key, long expiresInSeconds);
  }
  // PreSignedUrl { String signedUrl; Map<String,String> signedHeaders; }
  ```
  装配规则：`lingshu.oss.provider=s3`（默认）→ `S3ObjectStorageClient`；`=tos` → `TosClient`。领域层只注入 `ObjectStorageClient`。
- Consumes: Task 2 的 MinIO；Task 1 的 `LINGSHU_S3_*`。

- [ ] **Step 1: 写单元测试（不连网）**

```java
package com.onlyactwo.lingshu.adapter.oss;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class S3ObjectStorageClientUrlTest {

    private S3Properties props(String publicBaseUrl) {
        S3Properties p = new S3Properties();
        p.setEndpoint("http://127.0.0.1:9000");
        p.setRegion("us-east-1");
        p.setAccessKey("ak");
        p.setSecretKey("sk-not-real");
        p.setBucket("lingshu");
        p.setPublicBaseUrl(publicBaseUrl);
        return p;
    }

    @Test
    void publicUrl_pathStyle_whenNoPublicBaseUrl() {
        try (S3ObjectStorageClient client = new S3ObjectStorageClient(props(""))) {
            assertThat(client.getPublicDownloadUrl("export/1.json"))
                    .isEqualTo("http://127.0.0.1:9000/lingshu/export/1.json");
        }
    }

    @Test
    void publicUrl_usesPublicBaseUrl_andStripsTrailingSlash() {
        try (S3ObjectStorageClient client = new S3ObjectStorageClient(props("https://files.example.com/"))) {
            assertThat(client.getPublicDownloadUrl("export/1.json"))
                    .isEqualTo("https://files.example.com/export/1.json");
        }
    }

}
```

- [ ] **Step 2: 写集成测试（连 MinIO）**

```java
package com.onlyactwo.lingshu.adapter.oss;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.ByteArrayInputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class S3ObjectStorageClientTest {

    @Autowired
    private ObjectStorageClient objectStorageClient;

    @Test
    @DisplayName("上传后下载内容一致，且公共 URL 可匿名读取")
    void putGet_roundTrip_andPublicUrlReadable() throws Exception {
        String key = "test/oss-smoke-" + System.currentTimeMillis() + ".txt";
        String content = "灵枢 MinIO smoke " + System.nanoTime();

        String etag = objectStorageClient.putObject(key,
                new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8)));
        assertThat(etag).isNotBlank();
        assertThat(new String(objectStorageClient.getObject(key), StandardCharsets.UTF_8)).isEqualTo(content);

        HttpURLConnection conn = (HttpURLConnection) new URL(objectStorageClient.getPublicDownloadUrl(key)).openConnection();
        assertThat(conn.getResponseCode()).isEqualTo(200);
    }

    @Test
    @DisplayName("预签名 PUT：用 URL 直传后可下载")
    void presignedPut_thenGet() throws Exception {
        String key = "test/oss-presign-" + System.currentTimeMillis() + ".txt";
        PreSignedUrl presigned = objectStorageClient.preSignedPutUrl(key, 300);
        assertThat(presigned.getSignedUrl()).contains(key).contains("X-Amz-Signature");

        HttpURLConnection conn = (HttpURLConnection) new URL(presigned.getSignedUrl()).openConnection();
        conn.setRequestMethod("PUT");
        conn.setDoOutput(true);
        presigned.getSignedHeaders().forEach(conn::setRequestProperty);
        conn.getOutputStream().write("via presigned".getBytes(StandardCharsets.UTF_8));
        assertThat(conn.getResponseCode()).isEqualTo(200);

        assertThat(new String(objectStorageClient.getObject(key), StandardCharsets.UTF_8)).isEqualTo("via presigned");
    }

}
```

- [ ] **Step 3: 运行，确认失败**

Run: `./mvnw -q test -Dtest='S3ObjectStorageClientUrlTest,S3ObjectStorageClientTest'`
Expected: 编译失败（`adapter.oss` 包不存在）。

- [ ] **Step 4: pom.xml 增加依赖与 surefire 分组**

在 `<properties>` 加 `<aws-sdk.version>2.29.52</aws-sdk.version>`；在 `</properties>` 之后、`<dependencies>` 之前加：

```xml
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>software.amazon.awssdk</groupId>
                <artifactId>bom</artifactId>
                <version>${aws-sdk.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>
```

`<dependencies>` 中 `ve-tos-java-sdk` 之后加：

```xml
        <dependency>
            <groupId>software.amazon.awssdk</groupId>
            <artifactId>s3</artifactId>
        </dependency>
        <dependency>
            <groupId>software.amazon.awssdk</groupId>
            <artifactId>url-connection-client</artifactId>
        </dependency>
```

`<build><plugins>` 中追加：

```xml
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <configuration>
                    <excludedGroups>${test.excludedGroups}</excludedGroups>
                </configuration>
            </plugin>
```

并在 `<properties>` 加 `<test.excludedGroups>external</test.excludedGroups>`（运行 external 用 `./mvnw test -Dtest.excludedGroups=none -Dtest=TosClientTest -DLINGSHU_OSS_PROVIDER=tos`）。

- [ ] **Step 5: 写接口、值对象、错误码**

`adapter/oss/ObjectStorageClient.java`：

```java
package com.onlyactwo.lingshu.adapter.oss;

import java.io.InputStream;

/**
 * 对象存储抽象：领域层只依赖本接口；实现按 lingshu.oss.provider 选择（s3 / tos）。
 * 失败一律抛 ServiceException，不打日志、不重试，由调用方决定处理。
 */
public interface ObjectStorageClient {

    /** 上传对象，返回 etag。key 支持 a/b/obj 多级前缀。 */
    String putObject(String key, InputStream content);

    /** 下载对象全部字节。 */
    byte[] getObject(String key);

    /** 公共读对象的下载链接（仅拼接，不签名）。 */
    String getPublicDownloadUrl(String key);

    /** 生成 PUT 直传预签名 URL。 */
    PreSignedUrl preSignedPutUrl(String key, long expiresInSeconds);

}
```

`adapter/oss/PreSignedUrl.java`：

```java
package com.onlyactwo.lingshu.adapter.oss;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.Map;

@Data
@AllArgsConstructor
public class PreSignedUrl {

    private String signedUrl;

    /** 直传时必须携带的请求头；可能为空 Map。 */
    private Map<String, String> signedHeaders;

}
```

`adapter/oss/OssErrorCode.java`：

```java
package com.onlyactwo.lingshu.adapter.oss;

import com.onlyactwo.lingshu.infrastructure.common.error.ErrorCode;
import lombok.Getter;

@Getter
public enum OssErrorCode implements ErrorCode {

    OSS_CONFIG_INVALID("OSS_CONFIG_INVALID", "对象存储配置无效"),
    OSS_KEY_INVALID("OSS_KEY_INVALID", "对象 key 无效"),
    OSS_CONTENT_INVALID("OSS_CONTENT_INVALID", "上传内容无效"),
    OSS_UPLOAD_FAILED("OSS_UPLOAD_FAILED", "对象上传失败"),
    OSS_DOWNLOAD_FAILED("OSS_DOWNLOAD_FAILED", "对象下载失败"),
    OSS_PRESIGN_FAILED("OSS_PRESIGN_FAILED", "预签名失败");

    private final String code;
    private final String message;

    OssErrorCode(String code, String message) {
        this.code = code;
        this.message = message;
    }

}
```

- [ ] **Step 6: 写 `S3Properties` 与 `S3ObjectStorageClient`**

`adapter/oss/S3Properties.java`：

```java
package com.onlyactwo.lingshu.adapter.oss;

import lombok.Data;
import lombok.ToString;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "lingshu.oss.s3")
public class S3Properties {

    /** 浏览器可达的 API 地址（预签名直传要从前端发起），如 http://127.0.0.1:9000。 */
    private String endpoint;

    private String region = "us-east-1";

    @ToString.Exclude
    private String accessKey;

    @ToString.Exclude
    private String secretKey;

    private String bucket;

    /** 可选：公共读的对外基地址（CDN / 反代）；为空时用 {endpoint}/{bucket}。 */
    private String publicBaseUrl;

}
```

`adapter/oss/S3ObjectStorageClient.java`：

```java
package com.onlyactwo.lingshu.adapter.oss;

import com.onlyactwo.lingshu.infrastructure.common.exception.ServiceException;
import jakarta.annotation.PreDestroy;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * S3 协议实现（MinIO / AWS S3 / 任何兼容服务）。path-style 访问以兼容 MinIO。
 */
@Component
@ConditionalOnProperty(name = "lingshu.oss.provider", havingValue = "s3", matchIfMissing = true)
public class S3ObjectStorageClient implements ObjectStorageClient, AutoCloseable {

    private final S3Properties properties;
    private final S3Client s3Client;
    private final S3Presigner presigner;

    public S3ObjectStorageClient(S3Properties properties) {
        validate(properties);
        this.properties = properties;
        StaticCredentialsProvider credentials = StaticCredentialsProvider.create(
                AwsBasicCredentials.create(properties.getAccessKey(), properties.getSecretKey()));
        S3Configuration serviceConfig = S3Configuration.builder().pathStyleAccessEnabled(true).build();
        URI endpoint = URI.create(properties.getEndpoint());
        Region region = Region.of(properties.getRegion());
        this.s3Client = S3Client.builder()
                .endpointOverride(endpoint)
                .region(region)
                .credentialsProvider(credentials)
                .serviceConfiguration(serviceConfig)
                .httpClientBuilder(UrlConnectionHttpClient.builder())
                .build();
        this.presigner = S3Presigner.builder()
                .endpointOverride(endpoint)
                .region(region)
                .credentialsProvider(credentials)
                .serviceConfiguration(serviceConfig)
                .build();
    }

    @Override
    public String putObject(String key, InputStream content) {
        requireKey(key);
        if (content == null) {
            throw ServiceException.of(OssErrorCode.OSS_CONTENT_INVALID);
        }
        try {
            byte[] bytes = content.readAllBytes();
            return s3Client.putObject(
                    PutObjectRequest.builder().bucket(properties.getBucket()).key(key).build(),
                    RequestBody.fromBytes(bytes)).eTag();
        } catch (SdkException | IOException e) {
            throw ServiceException.of(OssErrorCode.OSS_UPLOAD_FAILED, e);
        }
    }

    @Override
    public byte[] getObject(String key) {
        requireKey(key);
        try {
            return s3Client.getObjectAsBytes(
                    GetObjectRequest.builder().bucket(properties.getBucket()).key(key).build()).asByteArray();
        } catch (SdkException e) {
            throw ServiceException.of(OssErrorCode.OSS_DOWNLOAD_FAILED, e);
        }
    }

    @Override
    public String getPublicDownloadUrl(String key) {
        requireKey(key);
        String base = StringUtils.hasText(properties.getPublicBaseUrl())
                ? properties.getPublicBaseUrl()
                : properties.getEndpoint() + "/" + properties.getBucket();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/" + key;
    }

    @Override
    public PreSignedUrl preSignedPutUrl(String key, long expiresInSeconds) {
        requireKey(key);
        try {
            PresignedPutObjectRequest presigned = presigner.presignPutObject(PutObjectPresignRequest.builder()
                    .signatureDuration(Duration.ofSeconds(expiresInSeconds))
                    .putObjectRequest(PutObjectRequest.builder().bucket(properties.getBucket()).key(key).build())
                    .build());
            Map<String, String> headers = new LinkedHashMap<>();
            presigned.signedHeaders().forEach((name, values) -> headers.put(name, String.join(",", values)));
            headers.remove("host");
            return new PreSignedUrl(presigned.url().toString(), headers);
        } catch (SdkException e) {
            throw ServiceException.of(OssErrorCode.OSS_PRESIGN_FAILED, e);
        }
    }

    @PreDestroy
    @Override
    public void close() {
        presigner.close();
        s3Client.close();
    }

    private static void validate(S3Properties p) {
        if (!StringUtils.hasText(p.getEndpoint()) || !StringUtils.hasText(p.getRegion())
                || !StringUtils.hasText(p.getAccessKey()) || !StringUtils.hasText(p.getSecretKey())
                || !StringUtils.hasText(p.getBucket())) {
            throw ServiceException.of(OssErrorCode.OSS_CONFIG_INVALID,
                    "lingshu.oss.s3 需配置 endpoint/region/access-key/secret-key/bucket");
        }
    }

    private static void requireKey(String key) {
        if (!StringUtils.hasText(key)) {
            throw ServiceException.of(OssErrorCode.OSS_KEY_INVALID);
        }
    }

}
```

- [ ] **Step 7: `TosClient` 实现接口并条件装配；删除 `TosPreSignedUrl`**

`TosClient.java` 改动点：
1. 类声明改为 `public class TosClient implements ObjectStorageClient`，并在 `@Component` 下加 `@ConditionalOnProperty(name = "lingshu.oss.provider", havingValue = "tos")`（import `org.springframework.boot.autoconfigure.condition.ConditionalOnProperty` 与 `com.onlyactwo.lingshu.adapter.oss.ObjectStorageClient`、`com.onlyactwo.lingshu.adapter.oss.PreSignedUrl`）。
2. 四个公共方法加 `@Override`；`preSignedPutUrl` 返回类型改为 `PreSignedUrl`，返回语句改为 `return new PreSignedUrl(output.getSignedUrl(), output.getSignedHeader());`。
3. `git rm src/main/java/com/onlyactwo/lingshu/adapter/tos/TosPreSignedUrl.java`。

- [ ] **Step 8: 三个领域服务改用接口**

`DatasetDomainServiceImpl.java`：import 改为 `com.onlyactwo.lingshu.adapter.oss.ObjectStorageClient` 与 `com.onlyactwo.lingshu.adapter.oss.PreSignedUrl`；字段改为 `private final ObjectStorageClient objectStorageClient;`；`getUploadPreSignedUrl` 中：

```java
        PreSignedUrl presigned =
                objectStorageClient.preSignedPutUrl(objectKey, DatasetConstants.UPLOAD_PRESIGN_EXPIRES_SECONDS);
        Map<String, String> signedHeaders =
                presigned.getSignedHeaders() == null ? Collections.emptyMap() : presigned.getSignedHeaders();
```

`FileParseDomainServiceImpl.java`：import/字段同上；`tosClient.getObject(version.getOssPath())` → `objectStorageClient.getObject(version.getOssPath())`。

`CaseExportDomainServiceImpl.java`：import/字段同上；`tosClient.putObject(...)` → `objectStorageClient.putObject(...)`；`tosClient.getPublicDownloadUrl(objectKey)` → `objectStorageClient.getPublicDownloadUrl(objectKey)`。

确认无残留：`grep -rn "TosClient\|tosClient\|TosPreSignedUrl" src/main/java/com/onlyactwo/lingshu/domain` 应无输出。

- [ ] **Step 9: 测试改造**

- `TosClientTest`：类上加 `@Tag("external")`（import `org.junit.jupiter.api.Tag`），类注释追加一句"需 `LINGSHU_OSS_PROVIDER=tos` 且 sys_config 已配置 tos.config"。
- `FileParseDomainServiceTest`、`ExportCaseResultDomainServiceTest`：import `com.onlyactwo.lingshu.adapter.tos.TosClient` 改为 `com.onlyactwo.lingshu.adapter.oss.ObjectStorageClient`；字段 `private TosClient tosClient;` 改为 `private ObjectStorageClient objectStorageClient;`；所有 `tosClient.` 改为 `objectStorageClient.`；类注释中"真实 TOS"改为"对象存储（本地 MinIO）"。

- [ ] **Step 10: `application.yml` 的 `lingshu:` 节追加**

```yaml
  oss:
    provider: ${LINGSHU_OSS_PROVIDER:s3}
    s3:
      endpoint: ${LINGSHU_S3_ENDPOINT:http://127.0.0.1:9000}
      region: ${LINGSHU_S3_REGION:us-east-1}
      access-key: ${LINGSHU_S3_ACCESS_KEY:}
      secret-key: ${LINGSHU_S3_SECRET_KEY:}
      bucket: ${LINGSHU_S3_BUCKET:lingshu}
      public-base-url: ${LINGSHU_S3_PUBLIC_BASE_URL:}
```

- [ ] **Step 11: 运行测试**

Run: `./mvnw -q test -Dtest='S3ObjectStorageClientUrlTest,S3ObjectStorageClientTest,FileParseDomainServiceTest,ExportCaseResultDomainServiceTest,GetUploadPreSignedUrlDomainServiceTest'`
Expected: PASS；`TosClientTest` 不在默认运行集内。再跑 `./mvnw -q test` 全量应全绿。

- [ ] **Step 12: 提交**

```bash
git add pom.xml src/main/resources/application.yml src/main/java/com/onlyactwo/lingshu/adapter \
  src/main/java/com/onlyactwo/lingshu/domain src/test/java/com/onlyactwo/lingshu/adapter \
  src/test/java/com/onlyactwo/lingshu/domain/dataset/service/impl/FileParseDomainServiceTest.java \
  src/test/java/com/onlyactwo/lingshu/domain/task/service/impl/ExportCaseResultDomainServiceTest.java
git commit -m "refactor(oss): abstract object storage and add s3/minio implementation

领域层此前直接依赖火山 TOS 客户端，本地无法运行上传/解析/导出。
抽取 ObjectStorageClient 接口，新增基于 AWS SDK v2 的 S3 实现（默认，
对接 compose 中的 MinIO），TosClient 改为实现同一接口并仅在
lingshu.oss.provider=tos 时装配。需要真实 TOS 的测试打 external 标签，
surefire 默认排除。"
```

---

### Task 8: 限流（报告 1.8）

**Files:**
- Create: `src/main/java/com/onlyactwo/lingshu/infrastructure/ratelimit/{RateLimitProperties,RateLimitedException,GlobalRateLimitInterceptor,LoginAttemptLimiter}.java`
- Modify: `infrastructure/web/config/WebMvcConfig.java`, `infrastructure/common/exception/GlobalExceptionHandler.java`, `controller/AuthController.java`, `src/main/resources/application.yml`
- Test: `src/test/java/com/onlyactwo/lingshu/infrastructure/ratelimit/{LoginAttemptLimiterTest,LoginRateLimitMockMvcTest,GlobalRateLimitInterceptorTest}.java`

**Interfaces:**
- Produces: `RateLimitedException extends ServiceException`（`getRetryAfterSeconds(): long`）；`LoginAttemptLimiter.checkAllowed(ip, username)` / `recordFailure(ip, username)` / `reset(ip, username)`；429 响应带 `Retry-After` 头。
- Consumes: Task 6 的 `ErrorHttpStatus`；`server.forward-headers-strategy=native`（Task 1 已加）让 `request.getRemoteAddr()` 在反代后取到真实 IP。

- [ ] **Step 1: 写测试（三个类）**

`LoginAttemptLimiterTest.java`：

```java
package com.onlyactwo.lingshu.infrastructure.ratelimit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class LoginAttemptLimiterTest {

    @Autowired
    private LoginAttemptLimiter limiter;

    @Autowired
    private RateLimitProperties properties;

    @Test
    @DisplayName("失败达到上限后拒绝，reset 后恢复")
    void blocksAfterMaxFailures_andResets() {
        String ip = "10.0.0." + ThreadLocalRandom.current().nextInt(1, 255);
        String username = "u" + ThreadLocalRandom.current().nextInt(100_000, 1_000_000);

        for (int i = 0; i < properties.getLoginMaxFailures(); i++) {
            assertThatCode(() -> limiter.checkAllowed(ip, username)).doesNotThrowAnyException();
            limiter.recordFailure(ip, username);
        }
        assertThatThrownBy(() -> limiter.checkAllowed(ip, username))
                .isInstanceOf(RateLimitedException.class)
                .satisfies(e -> assertThat(((RateLimitedException) e).getRetryAfterSeconds()).isPositive());

        limiter.reset(ip, username);
        assertThatCode(() -> limiter.checkAllowed(ip, username)).doesNotThrowAnyException();
    }

}
```

`LoginRateLimitMockMvcTest.java`：

```java
package com.onlyactwo.lingshu.infrastructure.ratelimit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.concurrent.ThreadLocalRandom;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class LoginRateLimitMockMvcTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RateLimitProperties properties;

    @Test
    @DisplayName("连续登录失败超过上限：HTTP 429 + Retry-After")
    void tooManyLoginFailures_429() throws Exception {
        String ip = "10.1.0." + ThreadLocalRandom.current().nextInt(1, 255);
        String body = "{\"username\":\"nouser" + ThreadLocalRandom.current().nextInt(100_000, 1_000_000)
                + "\",\"password\":\"bad\"}";

        for (int i = 0; i < properties.getLoginMaxFailures(); i++) {
            mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body)
                            .with(req -> { req.setRemoteAddr(ip); return req; }))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value("LOGIN_FAILED"));
        }
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body)
                        .with(req -> { req.setRemoteAddr(ip); return req; }))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
                .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"));
    }

}
```

`GlobalRateLimitInterceptorTest.java`：

```java
package com.onlyactwo.lingshu.infrastructure.ratelimit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.concurrent.ThreadLocalRandom;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "lingshu.rate-limit.global-per-minute=3")
class GlobalRateLimitInterceptorTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("同一 IP 每分钟超过阈值：429")
    void perIpLimit_429() throws Exception {
        String ip = "10.2.0." + ThreadLocalRandom.current().nextInt(1, 255);
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/user/getCurrentUser").with(req -> { req.setRemoteAddr(ip); return req; }))
                    .andExpect(status().isUnauthorized());
        }
        mockMvc.perform(get("/api/user/getCurrentUser").with(req -> { req.setRemoteAddr(ip); return req; }))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "60"));
    }

}
```

- [ ] **Step 2: 运行，确认失败**

Run: `./mvnw -q test -Dtest='LoginAttemptLimiterTest,LoginRateLimitMockMvcTest,GlobalRateLimitInterceptorTest'`
Expected: 编译失败（`ratelimit` 包不存在）。

- [ ] **Step 3: 写 `RateLimitProperties` 与 `RateLimitedException`**

```java
package com.onlyactwo.lingshu.infrastructure.ratelimit;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "lingshu.rate-limit")
public class RateLimitProperties {

    /** 每 IP 每分钟允许的 /api 请求数；<=0 关闭。 */
    private long globalPerMinute = 600L;

    /** 同一 (ip, username) 窗口内允许的登录失败次数。 */
    private int loginMaxFailures = 5;

    /** 登录失败计数窗口（分钟）。 */
    private long loginWindowMinutes = 15L;

}
```

```java
package com.onlyactwo.lingshu.infrastructure.ratelimit;

import com.onlyactwo.lingshu.infrastructure.common.error.CommonErrorCode;
import com.onlyactwo.lingshu.infrastructure.common.exception.ServiceException;
import lombok.Getter;

/** 限流拒绝：携带 Retry-After 秒数，由 GlobalExceptionHandler 写入响应头。 */
@Getter
public class RateLimitedException extends ServiceException {

    private final long retryAfterSeconds;

    public RateLimitedException(long retryAfterSeconds) {
        super(CommonErrorCode.TOO_MANY_REQUESTS);
        this.retryAfterSeconds = retryAfterSeconds;
    }

}
```

- [ ] **Step 4: 写 `GlobalRateLimitInterceptor`**

```java
package com.onlyactwo.lingshu.infrastructure.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.redisson.api.RRateLimiter;
import org.redisson.api.RateIntervalUnit;
import org.redisson.api.RateType;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Duration;

/**
 * 每 IP 全局限流（Redisson RRateLimiter，实例间共享）。
 * key 含阈值，配置变更后自动落到新 key；键 2 分钟无访问自动过期。
 */
@Component
@RequiredArgsConstructor
public class GlobalRateLimitInterceptor implements HandlerInterceptor {

    private static final long RETRY_AFTER_SECONDS = 60L;
    private static final Duration KEY_TTL = Duration.ofMinutes(2);

    private final RedissonClient redissonClient;
    private final RateLimitProperties properties;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        long limit = properties.getGlobalPerMinute();
        if (limit <= 0) {
            return true;
        }
        String key = "ratelimit:ip:" + limit + ":" + request.getRemoteAddr();
        RRateLimiter limiter = redissonClient.getRateLimiter(key);
        limiter.trySetRate(RateType.OVERALL, limit, 1, RateIntervalUnit.MINUTES);
        limiter.expire(KEY_TTL);
        if (!limiter.tryAcquire()) {
            throw new RateLimitedException(RETRY_AFTER_SECONDS);
        }
        return true;
    }

}
```

- [ ] **Step 5: 写 `LoginAttemptLimiter`**

```java
package com.onlyactwo.lingshu.infrastructure.ratelimit;

import lombok.RequiredArgsConstructor;
import org.redisson.api.RAtomicLong;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 登录失败计数：同一 (ip, username) 在窗口内失败达到上限后拒绝登录尝试。
 */
@Component
@RequiredArgsConstructor
public class LoginAttemptLimiter {

    private final RedissonClient redissonClient;
    private final RateLimitProperties properties;

    public void checkAllowed(String ip, String username) {
        RAtomicLong counter = redissonClient.getAtomicLong(key(ip, username));
        if (counter.get() >= properties.getLoginMaxFailures()) {
            long ttlMillis = counter.remainTimeToLive();
            long retryAfter = ttlMillis > 0 ? Math.max(1, ttlMillis / 1000) : properties.getLoginWindowMinutes() * 60;
            throw new RateLimitedException(retryAfter);
        }
    }

    public void recordFailure(String ip, String username) {
        RAtomicLong counter = redissonClient.getAtomicLong(key(ip, username));
        if (counter.incrementAndGet() == 1L) {
            counter.expire(Duration.ofMinutes(properties.getLoginWindowMinutes()));
        }
    }

    public void reset(String ip, String username) {
        redissonClient.getAtomicLong(key(ip, username)).delete();
    }

    private static String key(String ip, String username) {
        return "login:fail:" + ip + ":" + username;
    }

}
```

- [ ] **Step 6: 接入 `AuthController`**

```java
package com.onlyactwo.lingshu.controller;

import com.onlyactwo.lingshu.controller.request.LoginRequest;
import com.onlyactwo.lingshu.controller.response.LoginResponse;
import com.onlyactwo.lingshu.domain.user.model.UserErrorCode;
import com.onlyactwo.lingshu.domain.user.service.AuthDomainService;
import com.onlyactwo.lingshu.domain.user.service.request.LoginDomainRequest;
import com.onlyactwo.lingshu.domain.user.service.response.LoginDomainResponse;
import com.onlyactwo.lingshu.infrastructure.common.exception.ServiceException;
import com.onlyactwo.lingshu.infrastructure.common.response.LingShuServiceResponse;
import com.onlyactwo.lingshu.infrastructure.ratelimit.LoginAttemptLimiter;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthDomainService authDomainService;
    private final LoginAttemptLimiter loginAttemptLimiter;

    @PostMapping("/login")
    public LingShuServiceResponse<LoginResponse> login(@RequestBody LoginRequest request,
                                                       HttpServletRequest httpRequest) {
        String ip = httpRequest.getRemoteAddr();
        String username = request.getUsername();
        loginAttemptLimiter.checkAllowed(ip, username);

        LoginDomainResponse domainResponse;
        try {
            domainResponse = authDomainService.login(buildLoginDomainRequest(request));
        } catch (ServiceException e) {
            if (e.getErrorCode() == UserErrorCode.LOGIN_FAILED) {
                loginAttemptLimiter.recordFailure(ip, username);
            }
            throw e;
        }
        loginAttemptLimiter.reset(ip, username);
        return LingShuServiceResponse.success(buildLoginResponse(domainResponse));
    }

    private LoginDomainRequest buildLoginDomainRequest(LoginRequest request) {
        LoginDomainRequest domainRequest = new LoginDomainRequest();
        domainRequest.setUsername(request.getUsername());
        domainRequest.setPassword(request.getPassword());
        return domainRequest;
    }

    private LoginResponse buildLoginResponse(LoginDomainResponse domainResponse) {
        return new LoginResponse(domainResponse.getToken());
    }

}
```

- [ ] **Step 7: `WebMvcConfig` 注册限流拦截器（在鉴权之前）；`GlobalExceptionHandler` 增加 429 处理**

`WebMvcConfig.addInterceptors` 改为：

```java
    private final GlobalRateLimitInterceptor globalRateLimitInterceptor;
    private final AuthInterceptor authInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(globalRateLimitInterceptor)
                .addPathPatterns("/api/**")
                .order(0);
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns(
                        "/api/auth/login",
                        "/error",
                        "/actuator/**"
                )
                .order(1);
    }
```

（import `com.onlyactwo.lingshu.infrastructure.ratelimit.GlobalRateLimitInterceptor`。）

`GlobalExceptionHandler` 在 `handleServiceException` 之前新增（import `HttpHeaders`、`HttpStatus`、`RateLimitedException`）：

```java
    @ExceptionHandler(RateLimitedException.class)
    public ResponseEntity<LingShuServiceResponse<Void>> handleRateLimited(RateLimitedException ex) {
        log.warn("Rate limited: retryAfter={}s", ex.getRetryAfterSeconds());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .body(LingShuServiceResponse.fail(ex.getErrorCode(), ex.getMessage()));
    }
```

- [ ] **Step 8: `application.yml` 的 `lingshu:` 节追加**

```yaml
  rate-limit:
    global-per-minute: ${LINGSHU_RATE_LIMIT_GLOBAL_PER_MINUTE:600}
    login-max-failures: ${LINGSHU_RATE_LIMIT_LOGIN_MAX_FAILURES:5}
    login-window-minutes: ${LINGSHU_RATE_LIMIT_LOGIN_WINDOW_MINUTES:15}
```

- [ ] **Step 9: 运行测试**

Run: `./mvnw -q test -Dtest='LoginAttemptLimiterTest,LoginRateLimitMockMvcTest,GlobalRateLimitInterceptorTest,AuthInterceptorStatusTest,CorsConfigTest'`
Expected: PASS。然后 `./mvnw -q test` 全量绿。

- [ ] **Step 10: 提交**

```bash
git add src/main/java/com/onlyactwo/lingshu/infrastructure/ratelimit \
  src/main/java/com/onlyactwo/lingshu/infrastructure/web/config/WebMvcConfig.java \
  src/main/java/com/onlyactwo/lingshu/infrastructure/common/exception/GlobalExceptionHandler.java \
  src/main/java/com/onlyactwo/lingshu/controller/AuthController.java \
  src/main/resources/application.yml \
  src/test/java/com/onlyactwo/lingshu/infrastructure/ratelimit
git commit -m "feat(security): add per-ip rate limit and login attempt limiter

基于 Redisson 实现每 IP 每分钟全局限流（默认 600）与登录失败计数
（同一 ip+username 15 分钟内 5 次），超限返回 429 并带 Retry-After。
阈值通过 LINGSHU_RATE_LIMIT_* 配置，多实例共享计数。"
```

---

### Task 9: CI（报告 1.9）

**Files:**
- Create（后端仓库）: `.github/workflows/ci.yml`
- Create（前端仓库 `F:/label/lingshu-web/`）: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 2 compose、Task 7 的 `external` 分组、Task 1 的 `deploy/.env.example`。

- [ ] **Step 1: 后端 `.github/workflows/ci.yml`**

```yaml
name: backend-ci

on:
  push:
    branches: [main, "migration/**"]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"
          cache: maven

      - name: Prepare .env (CI-only credentials)
        run: cp deploy/.env.example .env

      - name: Start middleware
        run: docker compose --env-file .env -f deploy/docker-compose.yml up -d --wait

      - name: Verify (excludes external-tagged tests)
        run: ./mvnw -B --no-transfer-progress verify

      - name: Upload surefire reports
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: surefire-reports
          path: target/surefire-reports

      - name: Middleware logs on failure
        if: failure()
        run: docker compose --env-file .env -f deploy/docker-compose.yml logs --tail=200

      - name: Stop middleware
        if: always()
        run: docker compose --env-file .env -f deploy/docker-compose.yml down -v
```

- [ ] **Step 2: 前端 `.github/workflows/ci.yml`（在 `F:/label/lingshu-web/`）**

```yaml
name: web-ci

on:
  push:
    branches: [main, "migration/**"]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Build
        run: npm run build
```

- [ ] **Step 3: 本地校验 YAML 与前端脚本**

```bash
cd /f/label/lingshu-backend && npx --yes js-yaml .github/workflows/ci.yml >/dev/null && echo backend-yaml-ok
cd /f/label/lingshu-web && npx --yes js-yaml .github/workflows/ci.yml >/dev/null && echo web-yaml-ok
cd /f/label/lingshu-web && npm ci && npm run lint && npx tsc --noEmit && npm run build
```

Expected: 两个 `*-yaml-ok`；前端三步均成功（若 `npm run lint` 有既有报错，记录到本任务提交正文，不在本阶段修复业务代码）。

- [ ] **Step 4: 提交（两个仓库各一次）**

```bash
cd /f/label/lingshu-backend && git add .github/workflows/ci.yml && git commit -m "ci: add backend workflow with compose-backed verify

GitHub Actions 使用 temurin 17，启动 docker compose 中间件后执行
./mvnw verify；external 标签测试由 surefire 默认排除，失败时上传
surefire 报告与中间件日志。"

cd /f/label/lingshu-web && git add .github/workflows/ci.yml && git commit -m "ci: add web workflow for lint, typecheck and build

新增 GitHub Actions：Node 22 下执行 eslint、tsc --noEmit 与
vite build，作为前端合并前的最低门槛。测试步骤在阶段 2 接入。"
```

---

### Task 10: 冒烟脚本与 README（报告 1.10）

**Files:**
- Modify: `pom.xml`（`spring-boot-starter-actuator`）、`src/main/resources/application.yml`（`management`）
- Create: `deploy/smoke.sh`, `README.md`

**Interfaces:**
- Produces: `GET /actuator/health` 返回 `{"status":"UP"}`（阶段 2 再加 prometheus 与独立管理端口）；`deploy/smoke.sh` 退出码 0 表示 health/login/getCurrentUser/401 四项通过。

- [ ] **Step 1: pom.xml 加 actuator；application.yml 追加**

```xml
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
```

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health
  endpoint:
    health:
      show-details: never
```

- [ ] **Step 2: 写 `deploy/smoke.sh`**

```bash
#!/usr/bin/env bash
# 冒烟：health → login → getCurrentUser → 无 token 应 401。
# 用法：SMOKE_ADMIN_PASSWORD=xxx bash deploy/smoke.sh [BASE_URL]
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://127.0.0.1:8080}}"
ADMIN_USER="${SMOKE_ADMIN_USER:-admin}"
ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD:?需设置 SMOKE_ADMIN_PASSWORD}"

step() { printf '[smoke] %s\n' "$*"; }
fail() { printf '[smoke] FAIL: %s\n' "$*" >&2; exit 1; }

step "health ($BASE_URL)"
for i in $(seq 1 30); do
  if curl -fsS "$BASE_URL/actuator/health" 2>/dev/null | grep -q '"status":"UP"'; then break; fi
  [ "$i" -eq 30 ] && fail "health 未在 60s 内变为 UP"
  sleep 2
done

step "login as $ADMIN_USER"
LOGIN_BODY=$(curl -fsS -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\"}" "$BASE_URL/api/auth/login")
echo "$LOGIN_BODY" | grep -q '"success":true' || fail "登录失败: $LOGIN_BODY"
TOKEN=$(echo "$LOGIN_BODY" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || fail "响应中无 token"

step "getCurrentUser"
ME=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/user/getCurrentUser")
echo "$ME" | grep -q "\"username\":\"$ADMIN_USER\"" || fail "getCurrentUser 异常: $ME"

step "unauthorized -> 401"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/user/getCurrentUser")
[ "$CODE" = "401" ] || fail "无 token 应返回 401，实际 $CODE"

step "ALL PASS"
```

- [ ] **Step 3: 写 `README.md`**

```markdown
# 灵枢 LingShu · 后端

数据标注平台后端（Spring Boot 3.4 / MyBatis-Plus / Redisson / RocketMQ / MinIO 或 TOS）。
设计文档见 `docs/INDEX.md`，迁移背景见仓库外 `灵枢迁移报告与总体计划.md`。

## 5 分钟起步

前置：Docker Desktop（≥ 4 GB 内存）、JDK 17 或 21。无需预装 Maven。

```bash
cp deploy/.env.example .env                                   # 1. 环境变量（本地口令，勿用于生产）
docker compose --env-file .env -f deploy/docker-compose.yml up -d --wait   # 2. MySQL/Redis/RocketMQ/MinIO
./mvnw verify                                                 # 3. 编译 + 全部集成测试（约 3–5 分钟）
./mvnw spring-boot:run                                        # 4. 启动；首启自动建表并写入 admin
SMOKE_ADMIN_PASSWORD=admin123456 bash deploy/smoke.sh         # 5. 冒烟（另开终端）
```

首启会按 `.env` 中的 `LINGSHU_JWT_SECRET` / `LINGSHU_ADMIN_INITIAL_PASSWORD` 写入 `sys_config` 与 `admin` 账号，
之后修改这两个变量不再生效（改密码走 `/api/user/changePassword`）。

前端：`F:/label/lingshu-web` 执行 `npm ci && npm run dev`，访问 http://localhost:5173，用 admin 登录。

## 常用命令

| 目的 | 命令 |
|---|---|
| 重置本地数据 | `docker compose --env-file .env -f deploy/docker-compose.yml down -v` 后重新 `up -d --wait` |
| 只跑某个测试 | `./mvnw -q test -Dtest=CreateCaseDomainServiceTest` |
| 跑需要真实火山 TOS 的测试 | `LINGSHU_OSS_PROVIDER=tos ./mvnw test -Dtest.excludedGroups=none -Dtest=TosClientTest` |
| MinIO 控制台 | http://127.0.0.1:9001（账号密码见 `.env` 的 `LINGSHU_S3_*`） |
| 打包 | `./mvnw -DskipTests package` → `target/lingshu-0.0.1-SNAPSHOT.jar` |

## 配置

全部配置通过环境变量注入，清单与默认值见 `deploy/.env.example`。
对象存储默认 `s3`（MinIO）；切到火山 TOS 时设 `LINGSHU_OSS_PROVIDER=tos` 并在 `sys_config` 写入 `tos.config`。
```

- [ ] **Step 4: 端到端验证**

```bash
cd /f/label/lingshu-backend
./mvnw -q -DskipTests package
(java -jar target/lingshu-0.0.1-SNAPSHOT.jar > /tmp/lingshu.log 2>&1 &) ; sleep 25
SMOKE_ADMIN_PASSWORD=admin123456 bash deploy/smoke.sh
```

Expected: 依次打印 `[smoke] health`、`login as admin`、`getCurrentUser`、`unauthorized -> 401`、`ALL PASS`，退出码 0。验毕结束 java 进程（`taskkill //F //IM java.exe` 或按 PID）。

- [ ] **Step 5: 前端手工全流程（阶段验收）**

`cd /f/label/lingshu-web && npm run dev`，浏览器 http://localhost:5173：admin 登录 → 创建工作空间与成员 → 创建标注工具 → 新建数据集并上传 `.jsonl`（直传 MinIO，控制台 9001 可见对象）→ 版本解析为 READY → 创建 Case（LABEL + REVIEW 两阶段）→ 标注员领取标注提交 → 审核通过 → 导出结果，下载链接可打开。任一步失败记录到 `docs/superpowers/plans/phase1-acceptance-notes.md` 后再修。

- [ ] **Step 6: 提交**

```bash
git add pom.xml src/main/resources/application.yml deploy/smoke.sh README.md
git commit -m "docs: add quick start readme and smoke script

新增 README 5 分钟起步流程与常用命令，deploy/smoke.sh 覆盖
health、登录、getCurrentUser 与 401 校验。引入 actuator 仅暴露
health 端点，为阶段 2 的指标采集预留。"
```

---

## 阶段 1 完成判定

- [ ] 干净克隆 + `cp deploy/.env.example .env` + `docker compose ... up -d --wait` + `./mvnw verify` 全绿（external 除外）。
- [ ] `grep -rn "lzx2005" .` 无结果；`git log --all -p | grep lzx2005` 仅出现在 upstream 历史提交中。
- [ ] `smoke.sh` 通过；前端手工全流程通过。
- [ ] 两个仓库 CI 工作流文件存在且 YAML 合法。
- [ ] 报告 §3 缺陷 F1–F8、F14 均可指到对应提交。

## 自审记录（写计划时完成）

- 规格覆盖：报告阶段 1 任务 1.1–1.10 全部映射（见 Global Constraints 的编号映射）；F14 并入 Task 6。
- 占位符扫描：无 TBD/TODO；所有代码步骤含完整代码；`minio/minio:latest` 与 `minio/mc:latest` 为有意选择（首次拉取后可在 compose 中改为固定 tag）。
- 类型一致性：`ObjectStorageClient` 四个方法签名在 Task 7 接口、S3 实现、TosClient 改造与三个领域服务调用处一致；`PreSignedUrl.getSignedHeaders()` 与 `DatasetDomainServiceImpl` 调用一致；`RateLimitedException.getRetryAfterSeconds()` 与 handler/测试一致；`SystemBootstrapRunner.ADMIN_USERNAME` 为包可见常量供测试引用。
