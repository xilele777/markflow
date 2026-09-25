# Bug 清单：2026-09-25 审阅（第二轮）

审阅日期：2026-09-25。基线提交：`dbbd889`（main）。方式：静态代码审阅（全量，非仅 diff）+ 对照规则表 0004 与前两轮审阅记录；每项发现均已在当前源码中逐项核验属实，无凭审阅工具输出直接采信的条目。

## 结论

- 前两轮（B1–B8、N1）已闭环，见 [第一轮清单](2026-09-24-project-review-bugs.md) 与 [N1 验收](2026-09-25-project-review-fixes.md)，本轮不重复。
- 本轮新确认 **10 项**：1 项 P2、4 项 P3、5 项 P4（性能 / 结构 / 设计纪律）。无安全漏洞类发现。
- 逐项详情与修复建议见下；修复验收见 [第二轮修复验收](2026-09-25-project-review-round2-fixes.md)。

## 总表

| 编号 | 级别 | 位置 | 概要 |
|---|---|---|---|
| R1 | P2 | [task.service.ts:350](../../apps/server/src/modules/task/task.service.ts#L350) | 驳回链回退到紧邻上一阶段，经过 AI 预审（aiPreReview）时形成无法修复数据的乒乓循环 |
| R2 | P3 | [task.workers.ts:131](../../apps/server/src/modules/task/task.workers.ts#L131) | task-completed 派发遇锁竞争 3 次重试耗尽后 job 永久 failed，样本滞留池中无触发 |
| R3 | P3 | [case.service.ts:352](../../apps/server/src/modules/task/case.service.ts#L352) | 导出触发无并发防护：EXPORTING 中可重复触发，并发导出互相覆盖状态、遗留孤儿对象 |
| R4 | P3 | [case.repo.ts:91](../../apps/server/src/modules/task/case.repo.ts#L91) | 清除截止时间后 `deadline: null` 键残留，case 永久占据每分钟截止扫描名额 |
| R5 | P3 | [task.service.ts:420](../../apps/server/src/modules/task/task.service.ts#L420) | 自动回收逐条 N+1（每条 3 次 DB 往返 + 逐组重算统计），满载时每分钟约 1500 条语句 |
| R6 | P4 | [useExecutionQueue.ts:49](../../apps/web/src/features/exec/useExecutionQueue.ts#L49) | advance() 固定 pageSize:20 重建在手队列，超过 20 条时执行页计数失真、窗口外任务不可达 |
| R7 | P4 | [dataset.service.ts:427](../../apps/server/src/modules/dataset/dataset.service.ts#L427) | datePart() 与 case-export.service.ts:190 逐字重复，应抽共享 util |
| R8 | P4 | [main.ts:29](../../apps/server/src/main.ts#L29) | 同进程构建两套完整任务域服务图（createApp 与 startWorkers 各自 createTaskModule） |
| R9 | P3 | [LabelExecPage.tsx:118](../../apps/web/src/features/exec/pages/LabelExecPage.tsx#L118) | 提交失败时 axios 拦截器已全局 toast，页面 onError 再弹同文案，每次失败双提示 |
| R10 | P4 | 多文件 | 硬编码状态色值违反设计纪律（值本就存在于 tones.ts 语义色中），7 个文件十余处 |

## 详情与修复建议

### R1 · P2：驳回链经过 AI 预审阶段时形成乒乓循环，缺陷数据永远无法被人工修复

位置：[task.service.ts:350-411](../../apps/server/src/modules/task/task.service.ts#L350-L411)（`prevStageInPlan` 取紧邻上一阶段）；[config.ts:220-224](../../apps/server/src/modules/task/config.ts#L220-L224)（实现）；[case.service.ts:769-789](../../apps/server/src/modules/task/case.service.ts#L769-L789)（`validateTaskPlan` 只要求 code 严格递增，允许非连续组合）。

**现象**：计划含 `aiPreReview` 时（如 `[label, aiPreReview, recheck]` 或连续的 `[label, aiPreReview, review]`），人工审核阶段驳回后 target 取到 AI 预审任务（规则 5.3「prevStage = plan 中前一阶段」）。AI 预审不生产数据——它重审的输入 `(inputData, labelResult)` 均未变化，结论大概率与上轮相同：

- AI 重审通过 → task-completed → 驳回者的任务重开（3.1.6）→ 再审同一份结果 → 再驳回 → round 持续 +1，无限乒乓；
- 期间标注员永远收不到打回通知，缺陷数据无人修复。

**根因**：驳回的语义是「数据有质量问题，回退重做」，但回退目标沿流程图取紧邻阶段，而 `aiPreReview` 是审核型阶段——它既不修改数据，其重审结论又无信息增量。

**修复建议**：人工审核阶段（review / recheck）驳回时，向前跳过 `aiPreReview`，取最近的数据生产阶段（`aiPreLabel` 或 `label`）作为 target。`aiPreReview` 自身驳回（6.8 走 §5）的链不变（其 prev 本就是 label / aiPreLabel）。配套：`config.ts` 新增 `rejectTargetStageInPlan`；补一条非连续组合驳回的回归测试；规则表 0004 §5.3 追加修订行（§12）。

### R2 · P3：task-completed 派发失败重试窗口不足，job 永久 failed 后样本滞留池中

位置：[task.workers.ts:129-131](../../apps/server/src/modules/task/task.workers.ts#L129-L131)（事务提交后调用非 quietly 的 `dispatchPool`，异常上抛由 BullMQ 重试）；[dispatch-engine.ts:55](../../apps/server/src/modules/task/dispatch-engine.ts#L55)（派发锁 `waitMs: 3s / leaseMs: 30s`，拿不到抛 `OPERATION_CONFLICT`）；[queue.ts:69-74](../../apps/server/src/infra/queue.ts#L69-L74)（全局 `attempts: 3`、退避 5s 起步指数）。

**现象**：入池事务提交后 `dispatchPool` 因同池锁被长持有（lease 30s）抛 `OPERATION_CONFLICT`；BullMQ 3 次重试窗口总计仅约 15s，连环派发高峰期内 3 次都撞锁 → job 进入 failed。而 outbox 行在首次投递成功后已删除（[outbox.ts:129](../../apps/server/src/infra/outbox.ts#L129)），此后没有任何组件会再为该样本触发派发——任务停留在下一阶段池中，除非管理员暂停/恢复 case 或恰好同 case 同池命中自动回收，否则永远不会派给执行者。

**根因**：重试窗口（≈15s）远小于锁租期（30s）；且「事务已提交、入池已成功」后，派发失败属于可无限重试的无损操作，不该以 3 次为限。

**修复建议**：`createQueues` 为 `taskCompleted` 队列覆盖默认 `attempts: 10`（指数退避 5s 起，第 10 次约在 42 分钟后），覆盖锁租期与高峰窗口；注释说明原因。极端 10 次失败仍保留 removeOnFail 记录供人工介入（更新 case 状态即可全池补派，已有既有路径）。

### R3 · P3：导出触发无并发防护，EXPORTING 中可重复触发

位置：[case.service.ts:352-383](../../apps/server/src/modules/task/case.service.ts#L352-L383)（`exportCaseResult` 无锁、不校验 `lastExport.status`）。

**现象**：管理员双击或两人同时导出 → 两个 case-export job（消费端 concurrency=1 顺序执行）各自生成 uuid objectKey 上传 → 后完成者覆盖 `ext.lastExport`，先完成者的对象在桶中成为孤儿（无引用、无清理机制），随每次并发导出持续累积；详情页只显示最后一条。对比同类操作：`createCase` / `updateCaseStatus` 均有锁，导出触发没有。

**修复建议**：触发端照 `updateCaseStatus` 模式加锁 `case:export:{caseId}`，锁内重读 case，`lastExport.status === EXPORTING` 时拒绝（复用 `OPERATION_CONFLICT`），阻断重复触发。补并发重复触发被拒的回归测试。历史导出文件（DONE 后再次导出）不清理属既有设计，注明为已知边界不修。

### R4 · P3：清除截止时间后 null 键残留，case 永久占据每分钟扫描名额

位置：[case.repo.ts:82-97](../../apps/server/src/modules/task/case.repo.ts#L82-L97)（`updateExt` 用 jsonb `||` 合并，`{deadline: null}` 键仍保留，注释却称「要删除某键给 null」）；[case.repo.ts:117-127](../../apps/server/src/modules/task/case.repo.ts#L117-L127)（`selectRunningWithDeadline` 用 `ext ? 'deadline'` 键存在性判断，永真）。

**现象**：管理员设置过截止时间后清除 → `ext = {..., "deadline": null}` → 扫描查询每分钟取回该行，`scanDeadlines` 因 `typeof !== 'number'` 跳过。`DEADLINE_SCAN_LIMIT=500` 按 id 排序截断时，这些僵尸行把真实「即将到期 / 已逾期」case 挤出扫描窗口，通知漏发。

**修复建议**：两处同修，互为兜底：
1. `updateExt` 语义对齐注释：patch 中值为 null 的键用 jsonb `- text[]` 删除（`COALESCE(ext,'{}') || patch::jsonb` 后减去 null 键数组），数据库不再积累 null 垃圾键；该 repo 仅被 case 服务使用，全部 null 语义均为「清除」，无兼容风险。
2. `selectRunningWithDeadline` 条件改为 `jsonb_typeof(ext->'deadline') = 'number'`，对已产生的存量脏数据免疫。

### R5 · P3：自动回收逐条 N+1，满载每分钟约 1500 条语句

位置：[task.service.ts:420-489](../../apps/server/src/modules/task/task.service.ts#L420-L489)（`autoRecycleOverdueTasks`）。

**现象**：单次扫描命中上限 500 条候选（且全部超时）时，每条执行 `maxSeqInGroup` + `recycleToPool` + `refreshPersonalGroupStats` 三次独立 DB 往返，再按 case/pool 逐个 `dispatchPoolQuietly`，约 1500 条语句挤占连接池（上限 10）。平时未超时候选在 3 条语句前 continue，实际负载远低，属负载上限问题而非日常故障。

**修复建议**：本轮做安全的部分优化——受影响 `taskGroupId` 去重后循环结束统一一次 `refreshPersonalGroupStats`（统计为聚合，结果等价），语句数 1500 → 约 1000。`maxSeqInGroup` 逐条保留（与驳回路径并发写池时保证 seq 唯一，正确性优先）；按池批量分配 seq 需评估与 `rejectToPool` 的并发竞态，记为已知边界暂不动。

### R6 · P4：执行页队列固定 pageSize:20，超过 20 条在手时计数失真

位置：[useExecutionQueue.ts:42-73](../../apps/web/src/features/exec/useExecutionQueue.ts#L42-L73)。

**现象**：`advance()` 每次提交后按 `pageSize: 20` 拉在手任务重建续做队列。`preDispatchSize` 后端仅校验 ≥1 无上限（[case.service.ts:791-793](../../apps/server/src/modules/task/case.service.ts#L791-L793)），配 30 时顶栏「第 X / 20 题」与真实在手量不符，第 21-30 条在窗口外不可通过上一题/下一题到达，只能随前面任务完成逐条滑入，标注员误以为组内只剩 20 条。

**修复建议**：`advance()` 改为循环翻页拉全量（`pageSize: 100`，后端上限内，取到不足一页即停）。默认 `preDispatchSize=3` 下行为不变。

### R7 · P4：datePart() 两处逐字重复

位置：[dataset.service.ts:427-435](../../apps/server/src/modules/dataset/dataset.service.ts#L427-L435)（上传对象键日期段）与 [case-export.service.ts:190-199](../../apps/server/src/modules/task/case-export.service.ts#L190-L199)（导出对象键日期段）。

**现象**：同名同实现各持一份。未来调整对象键日期段规则（换时区处理或格式）只会改到一处，上传与导出的对象键日期段悄悄不一致且难排查。

**修复建议**：抽到共享模块（`modules/common/datetime.ts`），两处引用；[monitoring.service.ts:90](../../apps/server/src/modules/monitoring/monitoring.service.ts#L90) 同款 en-CA 格式化在抽取时核对格式，一致则一并复用。

### R8 · P4：main.ts 同进程构建两套任务域服务图

位置：[main.ts:29-33](../../apps/server/src/main.ts#L29-L33)；[create-app.ts:38-43](../../apps/server/src/app/create-app.ts#L38-L43) 与 [workers.ts:20-21](../../apps/server/src/app/workers.ts#L20-L21) 均已支持注入却未使用。

**现象**：`createApp(ctx)` 与 `startWorkers(ctx)` 各自内部 `createTaskModule(ctx)`，同进程重复实例化全部仓储/服务/派发引擎。当前服务无状态所以暂无错误行为，但未来任何给服务加入缓存或计数器状态时，HTTP 路径与 worker 路径各持一份导致行为分裂。

**修复建议**：`main.ts` 先建一个 `taskModule`，分别传入 `createApp(ctx, { taskModule })` 与 `startWorkers(ctx, taskModule)`。改动仅入口文件。

### R9 · P3：提交失败双重提示

位置：[LabelExecPage.tsx:118-121](../../apps/web/src/features/exec/pages/LabelExecPage.tsx#L118-L121) 与 [ReviewExecPage.tsx:76-78](../../apps/web/src/features/exec/pages/ReviewExecPage.tsx#L76-L78)；全局拦截器 [http.ts:44-46](../../apps/web/src/shared/api/http.ts#L44-L46)。

**现象**：业务失败（含网络错误）时 axios 响应拦截器已全局 `toast.error(后端 message)`，执行页 `onError` 再 `message.error` 同一文案，每次失败同屏两条重复提示；网络错误时页面弹的还会是 axios 的英文默认文案。

**修复建议**：页面层只提示拦截器覆盖不到的本地校验错误——`LabelExecPage` 的 `onError` 仅在 `ClientValidationError` 时弹（该错误未走 http），其余静默交给全局；`ReviewExecPage` 无本地校验，移除 `onError`。其余页面的 onError 不在本轮范围（多数有自己的上下文文案，需逐页甄别）。

### R10 · P4：硬编码状态色值违反设计纪律（十余处）

位置（值本就存在于 [tones.ts](../../apps/web/src/shared/constants/tones.ts) 的 STATUS 语义色中）：

| 文件 | 行 | 硬编码值 |
|---|---|---|
| [LabelExecPage.tsx](../../apps/web/src/features/exec/pages/LabelExecPage.tsx) | 316-322 | `#fbe9e7` / `#f3c2bd` / `#a8423a`（= STATUS.failed） |
| [ReviewExecPage.tsx](../../apps/web/src/features/exec/pages/ReviewExecPage.tsx) | 299-307, 313 | `#2c7a52`（= STATUS.done/ready）、`#a8423a` |
| [CaseNewPage.tsx](../../apps/web/src/features/case/pages/CaseNewPage.tsx) | 375, 775 | `#a8423a`、`#2c7a52` |
| [GroupDetailPage.tsx](../../apps/web/src/features/taskgroup/pages/GroupDetailPage.tsx) | 155 | `#a8423a` |
| [ExportResultSection.tsx](../../apps/web/src/features/case/components/ExportResultSection.tsx) | 293-299, 359-360 | 自建状态色 map（EXPORTING/DONE/FAILED 恰为 running/done/failed） |
| [DatasetDetailPage.tsx](../../apps/web/src/features/dataset/pages/DatasetDetailPage.tsx) | 165 | `#a8423a` |
| [PuckDemo.tsx](../../apps/web/src/features/labeltool/puck/PuckDemo.tsx) | 154 | `#a8423a` |

**现象**：违反 `apps/web/CLAUDE.md`「颜色只用 palette 与语义色」与 tones.ts 头注释「组件不得自建状态色 map」。调整状态色时这些位置全部漏改，全站不一致。上轮遗留项「73 个 lint warning」与此重叠。

**修复建议**：bg/fg 全部换 `STATUS.*.bg/.fg` 引用；tones 未提供边框 token，警示条边框改用中性 `palette.hairline`；`ExportResultSection` 删除自建 map 改用 STATUS（label 文案「导出中」保留覆盖）；`PuckDemo` 占位 SVG 内的 fill 是示例数据内容非 UI 样式，不动。完成后 lint warning 数应显著下降。

## 已知边界（本轮明确不修，记录在案）

| 边界 | 说明 |
|---|---|
| 自动回收按池批量分配 seq | 需与 `rejectToPool` 并发写池的 seq 竞态一并设计，留待后续 |
| 历史导出文件不清理 | DONE 后再次导出产生的历史对象键无清理机制，既有设计，桶容量允许 |
| 上轮遗留维护项 | 顶栏版本号硬编码、mock 残留、已读通知清理等，状态见 [第一轮清单](2026-09-24-project-review-bugs.md) 遗留表 |
