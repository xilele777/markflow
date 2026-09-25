# 第二轮审查缺陷修复与验收

日期：2026-09-25。修复基线：`dbbd889`（main）。范围：[第二轮 Bug 清单](2026-09-25-project-review-round2-bugs.md) R1–R10。

## 结论

**R1–R10 已全部修复并通过本地验收。** 根目录完整测试通过：发布打包 3 项、后端 211 项（含新增 5 项回归）、前端 68 项（含新增 2 项回归），共 282 项。两端类型检查、ESLint（0 error）、后端 Prettier 与生产构建均通过；前端 lint warning 由 73 降至 52（R10 消除全部硬编码色值告警）。

已知边界不修项与清单一致（批量 seq 竞态、历史导出不清理、上轮遗留维护项），本轮未扩大范围。

## 修复与回归证据

| 编号 | 修复 | 验收 |
|---|---|---|
| R1 | `rejectTargetStageInPlan`（[config.ts](../../apps/server/src/modules/task/config.ts)）：人工审核阶段（review / recheck）驳回时从紧邻上一阶段起向前跳过 `aiPreReview`，取最近数据生产阶段；[task.service.ts](../../apps/server/src/modules/task/task.service.ts) 驳回分支改用该函数；`aiPreReview` 自身驳回链不变 | 纯函数覆盖连续 / 非连续组合；API 层 `[label, aiPreReview, recheck]` 组合 recheck 驳回后 label task REWORK round 2、AI 预审保持 DONE 不被重开、标注员收到 TASK_REJECTED（旧实现打回 AI 形成乒乓、标注员永远收不到通知）。既有 `label → aiPreReview → review` 测试按新链改写：人工驳回后 AI 不再被直接打回，标注重做后 AI 重开重审、通过后 review 重开 round 2 |
| R2 | [queue.ts](../../apps/server/src/infra/queue.ts) 为 `taskCompleted` 队列覆盖默认 `attempts: 10`（指数退避 5s 起步，第 10 次约 42 分钟后），覆盖派发锁租期 30s 与连环提交高峰；其余队列保持 3 次 | 经 outbox 真实入队后读回 job `opts.attempts === 10`（未启动 worker，job 停留等待队列） |
| R3 | [case.service.ts](../../apps/server/src/modules/task/case.service.ts) `exportCaseResult` 照 `updateCaseStatus` 模式加锁 `case:export:{caseId}`（3s/30s），锁内重读 case，`lastExport.status === EXPORTING` 时拒绝（OPERATION_CONFLICT，附「该 Case 正在导出中」文案） | EXPORTING 中重复触发返回 OPERATION_CONFLICT；手工推进 DONE 后可再次触发且状态回到 EXPORTING |
| R4 | [case.repo.ts](../../apps/server/src/modules/task/case.repo.ts) 两处同修：`updateExt` 对 patch 中 null 值键用 `jsonb - text[]` 删除（兑现「要删除某键给 null」的注释语义）；`selectRunningWithDeadline` 改 `jsonb_typeof(ext->'deadline') = 'number'`，对存量 `{"deadline": null}` 僵尸数据免疫 | 清除截止后 ext 中 deadline 键整体消失（m5 既有断言同步改为「键不存在」）；查询侧验证清除行与手工造的 null 键行都不再进扫描窗口 |
| R5 | [task.service.ts](../../apps/server/src/modules/task/task.service.ts) `autoRecycleOverdueTasks` 受影响 taskGroupId 收集去重后循环结束统一一次 `refreshPersonalGroupStats`（聚合等价）；`maxSeqInGroup` 逐条保留（与 `rejectToPool` 并发写池 seq 竞态，正确性优先），满载语句数 1500 → 约 1000 | 既有自动回收两条测试（超时回收 / REWORK 保留 / 重派给他人、未配置不回收）全部通过，行为等价 |
| R6 | [useExecutionQueue.ts](../../apps/web/src/features/exec/useExecutionQueue.ts) `advance()` 改循环翻页拉全量（`pageSize: 100` 后端上限内，不足一页即停）；在手状态列表 label 查 2/5、review 查 3/5 不变 | 130 条在手任务（100+30 两页）全部进入续做队列，顶栏显示「第 2 / 131 题」；翻页参数断言 pageSize=100、状态 2 连续拉 2 页 |
| R7 | 新建 [common/datetime.ts](../../apps/server/src/modules/common/datetime.ts)（`datePart` / `dayKey`），dataset 上传键、case 导出键、monitoring 趋势分组三处统一引用 | 类型检查 + 既有上传 / 导出 / 监控测试通过；三处格式同源（en-CA YYYY-MM-DD） |
| R8 | [main.ts](../../apps/server/src/main.ts) 先建一个 `taskModule` 分别传入 `createApp(ctx, { taskModule })` 与 `startWorkers(ctx, taskModule)`，同进程不再构建两套任务域服务图 | 两注入入口为既有实现（此前测试已用），main 改动仅入口装配；全量测试通过 |
| R9 | [LabelExecPage.tsx](../../apps/web/src/features/exec/pages/LabelExecPage.tsx) `onError` 仅在 `ClientValidationError`（本地校验、未走 http）时弹提示；[ReviewExecPage.tsx](../../apps/web/src/features/exec/pages/ReviewExecPage.tsx) 移除 `onError`（无本地校验），后端 / 网络错误统一由 http.ts 全局拦截器 toast | 前端回归：后端提交失败时页面无重复错误文案且不切题；既有 B8 连续作业 6 条测试通过 |
| R10 | bg/fg 全部换 `STATUS.*` 语义色引用：LabelExecPage（ReboundBanner / DonePanel）、ReviewExecPage（通过 / 不通过按钮 + DonePanel）、CaseNewPage（阶段约束提示 / 比例合计）、GroupDetailPage（多轮次色）、DatasetDetailPage（解析失败原因）、ExportResultSection（删自建 STATUS_META map 改 STATUS，仅「导出中」文案保留覆盖；failureBox 边框无 token 改用中性 `palette.hairline`）、PuckDemo（示例数据错误提示）。PuckDemo 占位 SVG fill 为示例数据内容非 UI 样式，按清单结论不动 | 前端 lint warning 73 → 52（-21），硬编码色值告警清零；`@/shared/constants/tones` 语义色引用全部生效 |

## 检查结果

| 检查 | 结果 |
|---|---|
| 根 `npm run test:release` | 3 项全部通过 |
| 后端 `npm test` | 211 项全部通过（206 基线 + 新增 5 项回归），无跳过 |
| 前端 `npm test` | 68 项全部通过（66 基线 + 新增 2 项回归），无跳过 |
| 两端 TypeScript | 通过 |
| 后端 ESLint | 0 error |
| 前端 ESLint | 0 error；warning 73 → 52（R10 消除全部硬编码色值告警，剩余为 Fast Refresh / 未用变量等上轮遗留） |
| 后端 Prettier | 通过（含修复文件已格式化） |
| 两端生产构建与预算 | 通过 |

测试使用 Windows、Node 24、Docker 中的 PostgreSQL / Redis / MinIO；后端仅在 `markflow_test` 数据库与 `markflow_test` 队列前缀造数。

## 兼容性与影响

- **R1 为行为语义变更**：驳回目标从「紧邻上一阶段」改为「最近的数据生产阶段」。历史运行中的 case 若正处旧语义的乒乓循环中，下一次驳回即按新规则打回标注员，自然收敛，无需数据修正。规则表见 [派发与提交规则表](../reference/0004-2026-09-22-派发与提交规则表.md) §12（5.3 / 8.1 / §9 三条修订行）。
- R4 写入语义修正对历史 `{"deadline": null}` 存量脏数据由查询侧免疫兜底，无需数据迁移；此后清除截止的 case 不再占扫描名额。
- R2/R3 为可靠性加固，不改接口契约；R3 新增的拒绝响应复用既有 `OPERATION_CONFLICT` 错误码（前端全局 toast 已覆盖），无新增错误码。
- R6 默认 `preDispatchSize=3` 下行为不变；配置大于 20 时顶栏计数与窗口外任务首次正确。
- R7/R8/R10 为结构 / 纪律整改，无运行时行为差异；R9 后提交失败仅弹一条全局提示。
