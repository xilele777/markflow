# 项目审查修复与验收

日期：2026-09-24。修复基线：`38a7283`。范围：[原审查](2026-09-24-project-review.md) B1–B8、关联回归测试、规则说明与根 README。

## 结论

**B1–B8 已修复并通过本地验收。** 根目录完整测试通过：发布打包 3 项、后端 204 项、前端 66 项，共 273 项。真实 Chrome 完成 6 条样本的标注、质检和 Case 自动结束，覆盖通知入口与直接打开任务组 URL。

原审查列出的未实现功能与上线条件仍保留，不纳入本次缺陷修复的完成声明。没有进行生产部署、历史数据迁移或业务切换。

## 修复与回归证据

| 编号 | 修复 | 验收 |
|---|---|---|
| B1 | 创建 Case 校验数据集未删除、同空间、源数据类型和工具匹配 | 跨空间、已删除数据集、结果集和工具不匹配均拒绝；合法创建及原流程测试通过 |
| B2 | 任务插入按 500 行分批、已有任务查询按 1000 个样本分批；保留事务；ON CONFLICT 处理重复插入 | 5000 条全部创建，主键引用唯一、首批派发 3 条、末条源样本可读；重复入池总数不变 |
| B3 | 保存 / 提交在事务内锁定任务，重新校验在手状态、持有人、轮次、组与领取时间；首次结果版本初始化在任务事务外执行 | 提交后覆盖被拒且审核结果不变；旧轮次、回收、重新领取后的陈旧操作均被拒；4 个任务并发首次保存通过 |
| B4 | 完成消息携带源任务轮次；新增 forwarded_round，推进标记与下游入池同事务 | 并发重复投递不会重开已通过审核；旧轮次被忽略；真正驳回重标可开启下一轮；入池失败回滚、派发失败可重试；旧消息兼容测试通过 |
| B5 | READY 版本直接跳过；同版本消费者用数据库连接级锁串行执行 | 重复及并发解析保留样本主键与内容；已有任务引用和样本读取保持有效 |
| B6 | 最大余数法生成守恒的整数配额，同余数按成员配置顺序分配 | 总量 1 / 3、50% / 50% 的任务都能完成并自动结束；多人比例、零比例、不活跃成员及 5000 总量配额守恒 |
| B7 | 任务列表返回 taskType，操作文案与路由按服务端字段决定 | 组件测试覆盖三个审核阶段及过期导航 state；真实浏览器从通知和直接 URL 均进入质检执行页 |
| B8 | 两执行页共用队列逻辑；提交后查询标注 2 / 审核 3 及重标 5，等待结果再判断完成；失败可单独重试 | 标注 / 质检各 6 条连续提交；慢响应不提前结束；补题失败不会重复提交；刷新后可从任务详情恢复组 id |

后端专项测试见 [review-regressions.test.ts](../../apps/server/tests/review-regressions.test.ts) 与 [dataset-parse.test.ts](../../apps/server/tests/dataset-parse.test.ts)；前端见 [execution-regressions.test.tsx](../../apps/web/src/features/exec/execution-regressions.test.tsx)。原有任务流水线测试继续覆盖 AI、驳回、重标和复检。

## 检查结果

| 检查 | 结果 | 本机日志（不入 Git） |
|---|---|---|
| 根 `npm test` | 3 + 204 + 66 全部通过，无跳过 | `artifacts/review-fix-tests-final.log` |
| 两端 ESLint | 0 error；前端 73 warning | `artifacts/review-fix-lint.log` |
| 两端 TypeScript | 通过 | `artifacts/review-fix-typecheck.log` |
| 后端 Prettier | 通过 | `artifacts/review-fix-format.log` |
| 两端生产构建与预算 | 通过；入口 gzip 271.2 / 300 kB，最大 chunk 176.4 / 200 kB | `artifacts/review-fix-build.log` |
| Chrome + 真实前后端 | 6 条样本内置工具自动保存→标注提交→审核通过，最终 Case.status=4；两个审核入口正确 | `artifacts/review-fix-browser.log` |

测试使用 Windows、Node 24.14.0、Docker 中的 PostgreSQL / Redis / MinIO；后端仅在 `markflow_test` 数据库和 `markflow_test` 队列前缀造数。开发业务库未参与测试。开发期间并发解析测试曾发现持锁后另借连接导致的连接池耗尽，已统一为持锁连接执行；最终完整测试结果见上表。

## 浏览器复验

先启动基础设施并完成一次根 `npm test`，再打开独立终端：

```bash
cd apps/server
node --import tsx tests/helpers/review-browser-server.ts
```

此辅助服务仅接受测试数据库 / 测试队列，生成本地夹具并监听 8080；会清理测试任务队列，因此不要与集成测试并行运行。已有开发服务占用 8080 时应先停止该服务。

另开终端，在仓库根目录运行前端和验收脚本：

```bash
npm run dev:web
# 再开一个终端执行
node apps/web/e2e/e2e-review-regressions.mjs
```

需要本机 Chrome；自定义路径通过 `MARKFLOW_E2E_BROWSER` 指定。脚本见 [e2e-review-regressions.mjs](../../apps/web/e2e/e2e-review-regressions.mjs)。测试夹具写入忽略目录 `artifacts/`，其中的测试账号信息不提交。

## 兼容性与交付边界

- 新迁移 `0007_task_forwarded_round` 随服务启动执行。升级已有环境时先停旧应用 / worker 再迁移，避免旧消费者绕过轮次校验；迁移根据现有下游任务记录初始化已推进轮次。旧消息通过完成时间匹配当前轮次，新消息始终携带 round。
- READY 数据集不再原地重解析，需要重导数据时创建新版本。已结束任务的结果修改需走明确的驳回重标流程。
- [派发与提交规则](../reference/0004-2026-09-22-派发与提交规则表.md) §11 覆盖旧版不校验任务状态、比例独立取整等规则。
- README 已按面向使用者与贡献者的结构重写，包含快速开始、功能、技术栈、开发命令、贡献指南与项目状态。没有新增许可证，也没有变更仓库可见性。
- 本轮未进行生产容量压测、真实模型效果评估、依赖漏洞审计或 Linux 部署 / 备份恢复演练。前端 73 个维护警告与原审查列出的功能缺项仍需后续处理；云端 CI 状态以对应提交的 Actions 为准。
