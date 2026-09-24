# 标注任务列表

_Started 2026-06-04 09:28 UTC_

---

## User

现在开始设计标注任务列表页，接口是这样的，可以模仿一下数据集列表页

## Assistant

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: update_todos]_

The pattern is clear. I'll build a 标注任务 (Case) list page that reuses the shared shell components (`Sidebar`, `Topbar`, `Btn`, `Field`, `FilterChip`, `Pagination`) and mirrors the dataset list, following the project's list-page rules.

_[tool: write_file]_

_[tool: write_file]_

_[tool: update_todos]_

_[tool: show_html]_

_[tool: done]_

_[tool: update_todos]_

_[tool: fork_verifier_agent]_

标注任务列表页已完成，复用了数据集列表的外壳与原子组件，保持一致。

按接口与项目规范落地的要点：
- **列**：任务名 · 编号(CASE-…) · 数据来源(数据集/流式标签) · 标注工具 · 状态 · 创建人(纯文字) · 创建时间 · 操作(查看详情文字链)。
- **状态**用语义色点：未启动(灰)/运行中(蓝)/已暂停(琥珀)/已结束(绿)，对应 `status` 1–4。
- 工具栏右对齐(搜索+来源/状态筛选+新建)、底部分页、无大标题、无「共 N 条」、紧凑单行。

待你提供后续可补：**新建任务**和**查看详情**目前指向 `#`，需要时我再做创建表单与 Case 详情页（接口里 `taskPlanConfig`/`assignmentConfig`/`stageProgress` 那部分很适合做详情页的流程编排与进度视图）。

## User

补充 Case 详情页

## Assistant

_[tool: read_file]_

_[tool: read_file]_

I'll mirror the existing dataset detail page. Let me read it and the related detail HTML.

_[tool: str_replace_edit]_

_[tool: update_todos]_

Good — I understand the detail-page pattern. I'll add `CaseStatusPill` to the case-list exports, then build a Case detail page centered on the pipeline (`taskPlanConfig` + `stageProgress` + `assignmentConfig`).

_[tool: write_file]_

_[tool: write_file]_

Now wire the list's "查看详情" links to the detail page.

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: update_todos]_

_[tool: done]_

Renders cleanly. Let me finalize.court
<invoke name="fork_verifier_agent">
</invoke>

## User

数据集列表页、标注任务列表页，两个表单把“id”列都加上

## Assistant

_[tool: str_replace_edit]_

Both tables already show a formatted 编号 (DS-1042 / CASE-2048), but the API id is a plain `Long`. I'll add a dedicated numeric **ID** column as the first column on both tables.

Let me update the dataset list (app-shell.jsx) first.

_[tool: str_replace_edit]_

Now add the ID column to the dataset table's columns and rows.

_[tool: str_replace_edit]_

Now the task list — add numeric `cid` and an ID column.

_[tool: show_html]_

ID column is added to the task list. Let me verify the dataset list too.

_[tool: show_html]_

Both tables now have a numeric **ID** column as the first column (alongside the existing 编号 code), matching the API's `Long` id. Done.

_[tool: done]_

两个列表页都加上了独立的 **ID** 列（首列，显示 API 的 `Long` 数字 id），保留原有的「编号」展示码。无报错。

## User

case 详情页，流程进度还需要美化修改下因为我们目前最多有 5 个流程，你看看能怎么优化下？思路？

## Assistant

_[tool: str_replace_edit]_

Good question. Let me think through the approach before building.

**The problem:** the current horizontal layout (268px cards + arrows) blows past the content width at 5 stages and forces a horizontal scroll — and each card is tall because it stacks progress *and* assignment vertically, so it reads cramped.

**My approach — flip it to a vertical timeline.** A numbered connector rail down the left, each stage as a full-width band. This scales to any N (3 or 5), reads top→bottom like an actual pipeline, and gives every stage the full content width so progress and assignment can sit side-by-side instead of stacked. Per band: stage name + AI/人工 tag + a big % on the right, a segmented progress bar with the three counts (已完成/个人在做/池中待领) as a legend, then the assignment shown as compact chips + member pills.

Let me expand the mock to all 5 stages so you can see it handle the worst case, and rebuild the section.Now replace the helper components (progress bar / legend / KV / assign / column) with the new timeline pieces.

_[tool: str_replace_edit]_

Now swap the render block to the vertical timeline.

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: save_screenshot]_

Header card looks good. Let me see the full timeline (all 5 stages) by scrolling the main area.

_[tool: save_screenshot]_

_[tool: get_webview_logs]_

Layout renders correctly (the right cutoff is just the 1100px min-width vs. the narrow preview — fine on real screens). Let me confirm it's clean and finish.No errors. Let me hand off.

_[tool: done]_

_[tool: fork_verifier_agent]_

已重做流程进度区。**思路**：把横向卡片流改成**纵向时间轴**——左侧带编号节点的连接轨，每个阶段一条通栏卡。

为什么更优：
- **天然支持 1～5 段**，再多也只是往下排，不会横向溢出/挤压；
- 每段拿到整行宽度，**进度与人员分配并排**而非堆叠，更易读；
- 节点用颜色区分 **AI（蓝实心）/ 人工（描边）**，右上角大号百分比 + 已完成/总数一眼看完成度；
- 三色分段进度条（已完成绿 / 个人在做蓝 / 池中待领灰）配图例；分配信息用 chip + 成员胶囊（固定分配显示比例、未启用置灰）紧凑呈现。

已把示例任务扩成完整 5 段（含 AI 预标注、人工标注、AI 预审、人工初检、人工复检）方便你看满载效果。后台验证已在跑。

## User

Verifier agent check completed

## Assistant

验证通过 ✅ 五段流程时间轴渲染正常——连接轨/节点对齐、进度条、图例与分配 chip 都没问题。流程进度区优化完成。

## User

再做个动画吧，点一下流程卡片，可以向下展开查看每个流程的详情，这样一个流程卡片优先级不高的，都可以收进去，流程卡片只展示进度、已完成、个人在做、池中待领

## Assistant

_[tool: str_replace_edit]_

Good idea — collapse the assignment (lower-priority) into an expandable drawer, keep only progress + the three counts on the card face. Let me rebuild `StageRow` with a click-to-expand animation.

_[tool: show_html]_

Let me verify the expand animation works by toggling a card.

_[tool: multi_screenshot]_

_[tool: get_webview_logs]_

The collapsed cards now show only progress + the three counts + a chevron — assignment is hidden. Let me check for errors and confirm the expand animation via a directed verifier check.

_[tool: done]_

_[tool: fork_verifier_agent]_

完成 ✅ 流程卡片现在是**点击展开**式：

- **收起态**（默认）：卡片只展示阶段名 + AI/人工标签、进度条、百分比，以及「已完成 / 个人在做 / 池中待领」三项计数——优先级低的人员分配信息收进去了。
- **点击卡片**：向下平滑展开（grid-rows 高度过渡），露出「人员分配 / AI 配置」——策略/模型、预派发、自动回收 chip 与成员胶囊；右侧箭头同步旋转，hover 时边框微亮提示可点。

后台验证已在跑，结果回来我再同步。

## User

Verifier agent check completed

## Assistant

_[tool: str_replace_edit]_

The verifier caught a real bug — the `0fr→1fr` grid trick collapses to 0 here. I'll switch to a measured `max-height` transition with a ref.

_[tool: str_replace_edit]_

_[tool: show_html]_

Let me confirm it builds clean and re-verify the expand.

_[tool: multi_screenshot]_

_[tool: done]_

The capture tool renders from the top so I can't see the below-fold expansion directly. Let me have the verifier confirm the fix functionally.

_[tool: fork_verifier_agent]_

已修复。验证反馈说得对——`0fr→1fr` 在这个自动高度的网格里被解析成了 0px。改成了**实测高度的 `max-height` 过渡**：点击时用 ref 读取内容 `scrollHeight` 作为展开目标高度，收起回 0，配 `.28s` 缓动。已让验证器复测展开/收起高度，结果回来同步。

## User

### 创建 Case · `POST /api/case/createCase`
鉴权：需登录（空间标注管理员 / 系统管理员）。
**入参**
字段
类型
必填
说明
spaceCode
String
是
空间编码
name
String
是
任务名
description
String
否
描述
dataSourceType
Integer
是
1=数据集模式, 2=流式
datasetVersionId
Long
条件
数据集模式必填
labelTool
String
是
标注工具编码
taskPlanConfig
object
是
流程编排，见下
assignmentConfig
object
是
人员分配，见下
`taskPlanConfig`：`{ "stages": [ { "stage": Integer, "type": String } ] }`
	•	`type`（stage 类型，camelCase）：`aiPreLabel` / `label` / `aiPreReview` / `review` / `recheck`；`stage` 为规范编号（= 类型 code，1-5，以 type 为准）。
`assignmentConfig`：按 stage 配置，key 为 camelCase 类型名：
key
类型
说明
aiPreLabel
AiStage
AI 预标注
label
HumanStage
人工标注
aiPreReview
AiStage
AI 预审
review
HumanStage
人工初检
recheck
HumanStage
人工复检
`AiStage`：`{ aiCode: String, preDispatchSize: Integer, autoRecycleMinutes: Integer }`
`HumanStage`：`{ strategy: Integer(1=先到先得,2=固定分配), preDispatchSize: Integer, autoRecycleMinutes: Integer, members: [ { username, ratio, active } ] }`
	•	`members[].ratio`：固定分配时各 active 成员比例（之和需为 100）；先到先得时为 null。
**出参**：`{ caseId: Long }`

 页面定位：后台主框架内的独立全宽页（不是弹窗），顶部有「← 返回」+ 标题「新建标注任务」，底部是一条操作栏（取消 / 创建任务）
区块一 · 基本信息
	•	任务名（必填，单行）
	•	描述（可选，多行）
	•	数据源（必选，二选一：「数据集模式」/「流式标注」）
	•	数据集版本（下拉）——仅当数据源 = 数据集模式时出现；先选数据集、再选其下「已就绪」的版本（流式模式则隐藏此项）
	•	标注工具（必选，下拉）
区块二 · 流程编排
	•	一条固定顺序的流水线，含 5 个阶段，每个阶段是一个可勾选的开关，按此顺序排列： AI 预标 → 人工标注 → AI 预审 → 人工初检 → 人工复检
	•	用户只勾选「启用哪些阶段」，顺序不可调；可裁剪（不必全选）；约束：「AI 预标」和「人工标注」至少启用一个
	•	视觉上建议把 5 个阶段画成横向步骤/卡片，未勾选的置灰
区块三 · 人员 / AI 分配
	•	**只对「区块二里已勾选的阶段」**逐个展示一张配置卡；没勾选的阶段不出现
	•	阶段类型决定卡片样式：
	•	AI 阶段（AI 预标 / AI 预审）：选择「AI 配置」（下拉，按上面选的标注工具过滤）+ 预派条数 + 超时回收（分钟）
	•	人工阶段（人工标注 / 初检 / 复检）：
	•	派发策略（二选一：「先到先得」/「固定分配」）
	•	预派条数（默认 3）+ 超时回收分钟（默认 30）
	•	成员表格：每行 = 成员（选人）+ 启用开关 + 比例列
	•	比例列仅当策略 = 固定分配时出现，需填百分比，且所有「启用」成员之和 = 100；策略 = 先到先得时隐藏比例列
	•	表格下方有「+ 添加成员」
底部操作栏：取消 / 创建任务（创建前校验必填项、流程约束、固定分配比例之和）。
关键动态交互小结（务必体现）：
	1	数据源 = 数据集模式 → 显示「数据集版本」；= 流式 → 隐藏。
	2	区块二勾选的阶段，实时决定区块三出现哪些配置卡。
	3	人工阶段策略 = 固定分配 → 成员表出现「比例」列并要求和为 100；= 先到先得 → 无比例列。
	4	AI 配置下拉的可选项随「标注工具」联动过滤。

## Assistant

_[tool: read_file]_

_[tool: read_file]_

New page: 新建标注任务 form with rich dynamic interactions. Let me study the existing create/form pages first to match the visual vocabulary.

_[tool: update_todos]_

Excellent, I have the full form vocabulary. I'll build `create-case.jsx` reusing the shell + matching the upload page's atoms, with all four dynamic interactions.

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

Now wire the list's 新建任务 button to the create page.

_[tool: str_replace_edit]_

_[tool: show_html]_

Looks great. Let me check the lower blocks (流程编排 + dynamic config cards) and verify interactions by enabling stages.

_[tool: save_screenshot]_

_[tool: get_webview_logs]_

The capture tool can't scroll, so I'll let the verifier exercise the dynamic interactions. First, confirm no console errors.No errors. Let me hand off and run a thorough directed verification of the four dynamic behaviors.

_[tool: done]_

_[tool: update_todos]_

_[tool: fork_verifier_agent]_

「新建标注任务」全宽表单页已完成，并把列表页的「新建任务」按钮接上了。

三个区块 + 四个动态联动都已实现：

- **区块一 基本信息**：任务名、标注工具、描述、数据源（数据集模式/流式标注分段切换）；选「数据集模式」才出现 数据集 + 数据集版本（版本仅列「已就绪」、需先选数据集）。
- **区块二 流程编排**：5 个固定顺序阶段卡（AI预标→人工标注→AI预审→人工初检→人工复检），勾选启用、未选置灰；「AI预标/人工标注至少一个」约束含红字提示。
- **区块三 人员/AI 分配**：只为已启用阶段渲染配置卡——AI 阶段给「AI 配置（随工具过滤）+ 预派条数 + 超时回收」；人工阶段给「派发策略 + 预派条数 + 超时回收 + 成员表」，固定分配时出现「比例」列与合计=100 校验。
- **底部操作栏**：取消 / 创建任务，必填项、流程约束、比例合计未满足时按钮置灰不可点。

四个联动（数据源显隐、勾选驱动配置卡、策略驱动比例列、AI配置随工具过滤）已交给验证器逐条核对，结果回来我再同步。

## User

Verifier agent check completed

## Assistant

## User

### 我的任务组列表 · `POST /api/taskgroup/getMyTaskGroups`
鉴权：需登录（当前用户作为执行人）。分页。
**入参**
字段
类型
必填
说明
spaceCode
String
否
空间过滤
taskType
Integer
否
task 类型过滤（1-5）
pageNum / pageSize
Integer
否
分页
**出参**（`data[]`）
字段
类型
说明
taskGroupId
Long
任务组 id
caseId
Long
所属 case
caseName
String
case 名
spaceCode
String
空间编码
taskType
Integer
task 类型（1-5）
name
String
组名
labelTool
String
标注工具编码
status
Integer
组状态：1=待执行, 2=执行中, 3=已完成
createTime / updateTime
Long
时间



### 任务组内任务列表 · `POST /api/task/getTaskListInGroup`
鉴权：需登录。分页（可处理优先排序）。
**入参**
字段
类型
必填
说明
taskGroupId
Long
是
任务组 id
status
Integer
否
任务状态过滤（见附录）
pageNum / pageSize
Integer
否
分页
**出参**（`data[]`）
字段
类型
说明
taskId
Long
任务 id
bizId
String
业务 id
taskGroupSeq
Integer
组内序号
status
Integer
任务状态
round
Integer
重标轮次
claimTime
Long
领取时刻
createTime / updateTime


【画「我的任务组」的两个页面：列表页 → 详情页】

页面 A · 我的任务组列表

顶部工具条：左侧「类型筛选」下拉（按 task 类型过滤：人工标注 / 人工初检 / 人工复检…）；右侧显示「共 N 条」。
卡片内一张表格，列：
任务组（主列）：一个小的「阶段」标签（分类色）+ 所属任务（Case）名
标注工具（等宽字体编码）
状态（功能色标签：待执行=灰 / 执行中=蓝 / 已完成=绿）
更新时间
操作：「进入」
整行可点击 → 进入该任务组详情页。
底部分页器。空数据时显示「暂无任务组」空态。

页面 B · 我的任务组详情（二级页）
顶部有「← 返回」回到列表；标题区展示当前任务组信息（组名 / 阶段标签 / 所属任务名，这些信息从列表点进来时带入）。
顶部工具条：左侧「状态筛选」下拉（待分配 / 标注中·质检中 / 已完成 / 打回重标）；右侧文字汇总「在手 X · 待办 Y」。
卡片内一张「组内任务」表格，列：
序号（组内序号，等宽字体）
业务 ID（bizId，等宽字体，作主标识）
状态（功能色标签：待分配=灰 / 标注中·质检中=蓝 / 已完成=绿 / 打回重标=红）
轮次（round）
领取时间
操作：一个主按钮——本组是标注类就显示「进入标注」，是质检类就显示「进入质检」（同一个任务组里所有任务同类型），点击打开全屏执行页（标注页或质检页）。
底部分页器。空数据时显示「该任务组暂无任务」空态。

关键交互小结：

列表行点击 → 详情页；详情页「← 返回」→ 列表。
详情页任务行的「进入」→ 全屏执行页，标注 / 质检由任务组类型决定。
两页的状态列都用统一的功能色标签（蓝=进行中、绿=完成、红=打回、灰=空闲/待办）。
列表 / 详情都分页，都要有空态。

## Assistant

_[tool: read_file]_

_[tool: read_file]_

Two new pages: 我的任务组列表 → 详情. Let me re-read the shared atoms (Sidebar nav items, Pagination, STATUS/CATEGORY) so I match the vocabulary and wire navigation.

_[tool: read_file]_

Good — `我的任务组` is already a nav item. Let me see the Pagination and FilterChip atoms.

_[tool: update_todos]_

I have the full vocabulary. Note: the project's CLAUDE.md says **不显示「共 N 条」** — so on the list page I'll right-align the type filter (consistent with the other list pages) and drop the "共 N 条" text. On the detail page I'll keep the genuinely-useful **在手 X · 待办 Y** workload summary (it's a personal work signal, not a row-count total).

Mapping: taskType 1-5 → stage types; executor groups are the human stages (人工标注=标注 → 进入标注; 人工初检/复检=质检 → 进入质检).

_[tool: write_file]_

Now the detail page.

_[tool: write_file]_

Now the two HTML entries, plus a hover style for the clickable list rows.

_[tool: write_file]_

_[tool: write_file]_

_[tool: show_html]_

List page looks good. Let me check the detail page.

_[tool: show_html]_

_[tool: str_replace_edit]_

Both render well. One nit: the 轮次 column wraps "第 1 轮" — I'll add `nowrap` and a touch more width.Now verify clean and confirm a 质检-type group flips the labels. Let me hand off.

_[tool: done]_

_[tool: update_todos]_

court
<invoke name="fork_verifier_agent">
<parameter name="task">Check the two new pages 我的任务组.html (list) and 我的任务组详情.html (detail). Verify: (1) List rows are whole-row clickable links to 我的任务组详情.html?... with the group's name/type/caseName/tool in query params; each row shows a colored 阶段 tag (人工标注/初检/复检) + case name beneath, 标注工具 mono code, status pill (待执行 grey / 执行中 blue / 已完成 green), update time, and 进入 link; pagination present. (2) Navigate to 我的任务组详情.html?type=2 and confirm the task action buttons read 进入标注 and in-progress rows show 标注中; then navigate to 我的任务组详情.html?type=5&name=复检组 and confirm buttons read 进入质检 and in-progress rows show 质检中 (labels flip by group type). (3) Detail shows 在手 X · 待办 Y summary, 打回重标 rows are red with 第 2 轮 also red and a 重新标注/质检 button, 已完成 rows show plain 已完成 text. (4) The 轮次 column does not wrap to two lines. Report pass/fail per item with evidence.</parameter>
</invoke>

## User

画「标注页 / 质检页」（全屏任务执行页）原型，出两版：标注页 + 质检页】

页面定位：从「我的任务组详情」点某条任务的「进入」后打开的全屏页——整屏接管，没有左侧菜单、没有平台顶栏。沿用markflow设计（黑灰白中性外壳 + 功能色；主按钮描边式）。

整体分上下两段：

上段（操作条，很窄）：一条高度较小的工具条。

左侧：退出（返回任务组详情）+ 当前题信息：业务 ID（等宽字体、主标识）、进度「第 3 / 15 题」、轮次。
右侧：操作按钮，两版不同：
标注页：上一题 / 下一题 / 提交标注（描边主按钮）。没有"保存"按钮——保存结果在 iframe 内部，不属于平台。
质检页：上一题 / 下一题 / 通过（绿，语义成功色）/ 不通过（红，语义失败色）。
下段（iframe 区，占满剩余高度）：一个大的嵌入区域，用于加载 Puck 构建的标注/质检页面或外部页面。原型里画成一个占位渲染区（示意「标注工具渲染区 / IFRAME」）。注意：保存结果的按钮在这个 iframe 内部，不要画在上段操作条里。

交互：

不通过（仅质检页）：点「不通过」弹出一个小弹框填写「质检意见」（建议必填），确认后提交；「通过」则直接提交（意见可不填）。
提交后自动跳下一题：提交标注 / 通过 / 不通过成功后，自动加载下一条任务，上段题信息与下段 iframe 一起刷新。
上 / 下一题：在本任务组的任务列表内前后切换；第一题时「上一题」禁用；最后一题处理完给「本组已全部处理完」的提示。
风格 / 细节：

上段操作条：中性白底 + 底部一条发丝分隔线；"提交标注"用描边主按钮，"通过/不通过"用语义色（绿/红）。
业务 ID、进度、轮次用等宽字体、弱色。
下段 iframe 占绝大部分屏幕高度，上段只占很窄一条。

## Assistant

_[tool: write_file]_

Full-screen execution pages — two versions (标注页 / 质检页). I'll build one parameterized component (`mode: 'label' | 'qc'`) with two HTML entries, and wire the detail page's 进入 buttons to them.

Key contract I'll honor: **save button lives inside the iframe zone**, not in the top bar; QC's 不通过 opens a required-opinion modal; submit auto-advances; 上一题 disabled on first; completion state after the last item.Now the two HTML entries.

_[tool: write_file]_

_[tool: write_file]_

Now wire the detail page's 进入 buttons to the right execution page (label vs qc by group type).

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: show_html]_

Label page works. The progress text wraps on the narrow preview — I'll add `nowrap` to the mono info spans. Let me check the QC page first.

_[tool: str_replace_edit]_

Both versions render correctly with the right action buttons. Let me fix the text wrapping in the top bar and iframe label so they don't break on narrower widths.Now verify the reject modal and flow. Let me hand off clean and run a directed verification of the interactions.

_[tool: done]_

_[tool: update_todos]_

court
<invoke name="update_todos">
<parameter name="operations">[{"id":"12","type":"complete"},{"id":"13","type":"complete"}]</parameter>
</invoke>

