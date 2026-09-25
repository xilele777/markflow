# Bug 清单：2026-09-25 审阅

审阅日期：2026-09-25。基线提交：`9e4b29b`（main）。方式：静态代码审阅 + 对照 [2026-09-24 修复验收](2026-09-24-project-review-fixes.md) 的证据；本轮没有执行测试、修改代码或部署。

## 结论

- 上一轮 B1–B8 已全部修复，本轮逐一核对了当前源码中的修复实现，均在前（见下表）。
- 新确认 1 项 P2 缺陷（N1：固定比例成员列表可重复填同一用户，API 层破坏配额守恒）。
- 遗留维护项与未实现功能仍有效，见文末。

## B1–B8 修复在当前代码中的位置

| 编号 | 修复实现（已核对） |
|---|---|
| B1 | [case.service.ts:592-621](../../apps/server/src/modules/task/case.service.ts#L592-L621)：`validateDatasetVersion` 校验同空间、未删除、ANNOTATION 类型与工具匹配 |
| B2 | [task.repo.ts:23-34](../../apps/server/src/modules/task/task.repo.ts#L23-L34)：`batchInsert` 按 500 行分批 + ON CONFLICT；[dispatch-engine.ts:384-395](../../apps/server/src/modules/task/dispatch-engine.ts#L384-L395) 按 1000 个样本分批查 bizId |
| B3 | [task.service.ts:641-660](../../apps/server/src/modules/task/task.service.ts#L641-L660)：`lockWritableTask` 行锁内重新校验在手状态、持有人、轮次、组与领取时间 |
| B4 | [task.workers.ts:84-132](../../apps/server/src/modules/task/task.workers.ts#L84-L132)：`processTaskCompleted` 轮次校验 + `forwardedRound` 推进标记同事务 |
| B5 | [dataset-parse.service.ts:187-213](../../apps/server/src/modules/dataset/dataset-parse.service.ts#L187-L213)：READY 直接跳过 + 同版本 advisory lock 串行 |
| B6 | [dispatch-engine.ts:399-417](../../apps/server/src/modules/task/dispatch-engine.ts#L399-L417)：`allocateFixedQuotas` 最大余数法，配额之和守恒 |
| B7 | [GroupDetailPage.tsx:42-108](../../apps/web/src/features/taskgroup/pages/GroupDetailPage.tsx#L42-L108)：执行阶段始终取服务端返回的 `taskType` |
| B8 | [LabelExecPage.tsx:25-37](../../apps/web/src/features/exec/pages/LabelExecPage.tsx#L25-L37)：两执行页共用 `useExecutionQueue`，查在手状态 2 / 3 / 5 |

回归测试：后端 [review-regressions.test.ts](../../apps/server/tests/review-regressions.test.ts)、[dataset-parse.test.ts](../../apps/server/tests/dataset-parse.test.ts)；前端 [execution-regressions.test.tsx](../../apps/web/src/features/exec/execution-regressions.test.tsx)。验收证据见 [修复验收记录](2026-09-24-project-review-fixes.md)。

## 新缺陷

### N1 · P2：固定比例成员列表可重复填同一用户，配额守恒被破坏

位置：[case.service.ts:795-841](../../apps/server/src/modules/task/case.service.ts#L795-L841)（`validateHumanStage` 不拒绝重复 username）；[dispatch-engine.ts:399-417](../../apps/server/src/modules/task/dispatch-engine.ts#L399-L417)（`allocateFixedQuotas` 用 `new Map` 收敛结果，重复 username 后一条覆盖前者）。

创建 Case 的固定比例分配中，`validateHumanStage` 逐个成员校验 ratio 与角色，但**不拒绝同一 username 出现多条**。比例之和 = 100% 的校验按全部条目累加，可通过；而 `allocateFixedQuotas` 最终用 `new Map(shares.map(...))` 收敛，同名条目只剩最后一条的配额，其余配额丢失。

复现（API 层）：创建 Case，label 阶段 `strategy=FIXED_RATIO`，members 传入同一用户两条 `{username: 'a', ratio: 50}`。校验通过（50+50=100），但配额表中该用户只剩一条。派发时 `need = min(预派发数, memberLimit - assigned)` 被压低，结果与旧 B6 症状相同：部分样本永远留在池中，Case 无法自然完成。

边界说明：前端 [CaseNewPage.tsx:696](../../apps/web/src/features/case/pages/CaseNewPage.tsx#L696) 用 `usedNames` 阻止重复选择，正常 UI 操作不会触发；这是 API 直调绕过前端时的输入校验缺口。两条同用户条目中的 `active` 不同（一真一假）时行为更难预期。

建议：`validateHumanStage` 对重复 username 直接拒绝（MEMBER 配置重复），或 `allocateFixedQuotas` 按用户聚合后再分配。补一条 API 层重复成员的拒绝测试。

## 遗留维护项（上轮审阅已列，本轮仍有效）

| 项目 | 状态 |
|---|---|
| 顶栏版本号硬编码 `v0.9.2`（[Topbar.tsx:14-15](../../apps/web/src/app/layout/Topbar.tsx#L14-L15)），与根项目 `0.1.0` 不一致 | 未处理 |
| 前端 73 个 lint warning（硬编码颜色、未使用变量、Fast Refresh 等） | 未处理 |
| `features/labeltool/mock.ts` 未被页面引用、过期"脚手架走 mock"注释 | 未清理 |
| 已读通知无定期清理；截止扫描每批最多 500 case；禁用用户跨实例缓存最多 10s | 已知边界，未处理 |
| AI 耗尽重试后的手动重派、审核页草稿自动保存 | 未实现 |
| 标注工具更新端点、数据集 CSV 导入 | 未实现（规划缺项） |
| 规则预审引擎 P16 / 审核操作历史 P17 | 未实现（可选范围） |
| 生产部署、历史数据迁移、业务切换 | 未完成 |
