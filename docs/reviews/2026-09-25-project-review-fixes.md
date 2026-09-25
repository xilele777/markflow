# 项目审查缺陷修复与验收

日期：2026-09-25。修复基线：`9e4b29b`（main）。范围：[本轮 Bug 清单](2026-09-25-project-review-bugs.md) N1。

## 结论

**N1 已修复并通过本地验收。** 根目录完整测试通过：发布打包 3 项、后端 206 项（含新增 2 项回归）、前端 66 项，共 275 项。两端类型检查、ESLint（0 error）、Prettier 与生产构建均通过。

本轮只处理新确认的 N1；清单中的遗留维护项与未实现功能不在本次范围内，仍保留原状态。

## 修复与回归证据

| 编号 | 修复 | 验收 |
|---|---|---|
| N1 | `validateHumanStage` 按小写 username 去重，重复配置返回 `MEMBER_DUPLICATE`；`allocateFixedQuotas` 同时按用户合并 ratio，作为历史配置的兜底 | FIXED_RATIO 与 FCFS 下同用户两条均被拒；大小写不同视为同一用户；重复条目合并后配额之和等于总量、不因 `Map` 收敛丢失 |

新增回归测试：API 层见 [case.test.ts](../../apps/server/tests/case.test.ts)（`人工阶段：同一用户重复配置 → MEMBER_DUPLICATE`）；分配层见 [review-regressions.test.ts](../../apps/server/tests/review-regressions.test.ts)（`N1：同一 username 多条时按用户合并`）。

两项测试均已验证为**能捕获该缺陷**：暂时回退源码修复后，分配层用例因配额总量变为 5（期望 10）失败，API 层用例因返回 `SUCCESS` 而非 `MEMBER_DUPLICATE` 失败；恢复修复后全部通过。

## 检查结果

| 检查 | 结果 |
|---|---|
| 根 `npm test` | 3 + 206 + 66 全部通过，无跳过 |
| 两端 TypeScript | 通过 |
| 两端 ESLint | 0 error；前端 73 warning（与本轮基线一致，未新增） |
| 后端 Prettier | 通过 |
| 两端生产构建与预算 | 通过；入口 gzip 271.2 / 300 kB，最大 chunk 176.4 / 200 kB |

测试使用 Windows、Node 24、Docker 中的 PostgreSQL / Redis / MinIO；后端仅在 `markflow_test` 数据库与 `markflow_test` 队列前缀造数。

## 兼容性与影响

- 新增错误码 `MEMBER_DUPLICATE`（「成员不可重复配置」）。此前该输入会创建成功并导致配额丢失、Case 无法自然完成；现在直接拒绝。前端 [CaseNewPage.tsx](../../apps/web/src/features/case/pages/CaseNewPage.tsx) 的 `usedNames` 已阻止 UI 重复选择，正常页面操作不受影响。
- 已存在的历史 Case 若含重复成员配置，`allocateFixedQuotas` 按用户合并 ratio 后配额守恒，行为从「丢失配额」变为「合并后正常分配」，不再需要人工修正配置。
- 规则表见 [派发与提交规则](../reference/0004-2026-09-22-派发与提交规则表.md) §12。
