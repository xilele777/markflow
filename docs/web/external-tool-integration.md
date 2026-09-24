# 外部标注工具接入文档

> 给业务方 / 第三方标注工具研发者看的接入说明。
>
> 「外部标注工具」= 平台用 IFRAME 嵌入你写的网页（任意技术栈），让用户在你的页面里完成标注 / 质检，结果通过几个透传接口写回平台。

---

## 一、协作方式（一图）

```
┌─────────────────────────────────────────────────────────────┐
│ markflow平台执行页（父框架）                                       │
│                                                             │
│  ┌─ 顶栏：进度 / 上一题 / 下一题 / 提交 / 通过 / 驳回 ──────┐   │
│  │                                                       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ <iframe src="{你的 URL}?taskId=...[&mode=review]"> ─┐    │
│  │                                                     │    │
│  │   你的标注页面                                       │    │
│  │   · 从 URL 拿 taskId / mode                          │    │
│  │   · 调三个接口拉数据 / 保存草稿                       │    │
│  │   · 用户改动 → saveTaskResult                        │    │
│  │   · **不要自己做「提交」按钮**                        │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

关键约定：

1. **你的页面 = 一个能独立打开的 URL**，平台用 `<iframe>` 嵌入它。
2. **平台往 URL 里追加查询参数**告诉你「干什么、哪条任务」。
3. **你只负责数据展示 + 保存草稿**；提交 / 通过 / 驳回 在父框架顶栏。
4. **不需要 postMessage**，父子通过「URL 参数 + 三个公开接口」解耦。

---

## 二、URL 参数

平台打开你的页面时，会自动拼接：

```
{你注册的 labelToolUrl}?taskId={当前任务 id}[&mode=review]
```

| 参数 | 含义 |
|---|---|
| `taskId` | 当前任务的 id。**必有**，用它去查 / 存数据。 |
| `mode` | 缺省 = 标注模式；`mode=review` = 质检模式（**只读**展示标注结果，等父框架点通过 / 驳回）。 |

> 如果你的注册 URL 自带 query，平台会用 `&` 拼接而不是 `?`，已处理好。

---

## 三、三个公开接口

**所有接口** = `POST {host}/api/...`，请求体 / 返回值 JSON。一期对 iframe 链路**不鉴权**，你的页面不需要带 token。

返回包络（成功）：

```json
{ "success": true, "code": "0", "message": "ok", "data": { ... } }
```

下面只列 `data` 部分。

### 3.1 获取样本数据 · `POST /api/task/getSampleData`

**入参**

```json
{ "taskId": 1234 }
```

**出参**

```json
{
  "taskId": 1234,
  "bizId": "biz-abc",
  "sampleData": { /* 完全是你注册时声明的源数据，原样回传 */ }
}
```

`sampleData` 的结构 = 你注册标注工具时填的 `labelToolJsonSchema` 描述的形状。

### 3.2 获取任务结果 · `POST /api/task/getTaskResult`

用来回填用户之前的草稿，或者在质检模式下读已有的标注结果。

**入参**

```json
{ "taskId": 1234, "sampleType": 1 }
```

| sampleType | 含义 |
|---|---|
| 1 | 标注结果（标注页 / 质检页都要读这条） |
| 2 | 质检结果（一般只有平台父框架自己用） |

**出参**

```json
{
  "taskId": 1234,
  "sampleType": 1,
  "hasResult": true,
  "result": { /* 你之前保存过的 result；hasResult=false 时 result=null */ }
}
```

### 3.3 保存任务结果 · `POST /api/task/saveTaskResult`

后端**透传不校验** `result`，你想存啥存啥；但建议在文档里跟接收方（质检员 / AI / 数据平台）约定一份「结果 schema」。

**入参**

```json
{
  "taskId": 1234,
  "sampleType": 1,
  "result": { /* 任意 JSON */ }
}
```

**出参**：无。

### 3.4 你**不要**调的接口

`submitLabelTask` / `submitReviewTask` 由平台父框架在顶栏调用，你的页面千万别自己调；否则会绕过父框架的进度更新。

---

## 四、注册一个外部工具（平台侧的事）

平台管理员在 **系统 → 标注工具 → 创建标注工具 → 外部工具（IFRAME 接入）**，填四个字段：

| 字段 | 说明 |
|---|---|
| 编码 | 唯一编码，如 `ext-sentiment` |
| 名称 | 用户看到的中文名 |
| 工具地址 | 你的页面 URL（可以带固定 query） |
| 源数据 JSON Schema | Draft-07 JSON Schema，**描述** `sampleData` 形状（不是样本本身） |

### 4.1 `labelToolJsonSchema` 规则（**最容易踩坑**）

后端用 [networknt JSON Schema 校验器](https://github.com/networknt/json-schema-validator) Draft-07 编译你填的 schema，**编译不过就拒绝创建**（错误码 `LABEL_TOOL_JSON_SCHEMA_INVALID`）。规则：

| 项 | 要求 |
|---|---|
| 顶层 | 必须是 JSON 对象 |
| 顶层 `type` | **必须**是 `"object"`（描述一条样本是一个对象） |
| 顶层 `properties` | 描述每个字段的子 schema，如 `{"id":{"type":"string"}}` |
| 顶层 `required` | 可选，列出必填字段名数组 |
| 顶层 `$schema` | 可选，不写默认 Draft-07 |
| **顶层 key** | **必须是 JSON Schema 关键字**（type/properties/required/$ref/oneOf/...）。不要直接把业务字段名（`id`/`bizId` 等）放在顶层 —— `id` 是保留关键字会触发 `No suitable validator for id`；其它业务名虽不报错，但会被静默忽略，等于没校验 |

**最小推荐模板**：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id":                 { "type": "string" },
    "bizId":              { "type": "string" },
    "seller_asr_content": { "type": "string" }
  },
  "required": ["id", "bizId", "seller_asr_content"]
}
```

---

## 五、你的页面需要做什么

下面按时间顺序列。第六节有完整的示范代码（情绪判断例）。

1. **从 URL 取参数**

   ```ts
   const params = new URLSearchParams(location.search);
   const taskId = Number(params.get('taskId'));
   const readOnly = params.get('mode') === 'review';
   ```

2. **拉源数据**：调 `POST /api/task/getSampleData { taskId }` 拿 `sampleData`，按你声明的 schema 渲染界面。

3. **回填上次草稿**：调 `POST /api/task/getTaskResult { taskId, sampleType: 1 }`：
   - `hasResult=true` → 把 `result` 填回表单。
   - `hasResult=false` → 表单留空 / 默认值。

4. **用户改动 → 保存草稿**：调 `POST /api/task/saveTaskResult { taskId, sampleType: 1, result }`。
   推荐策略（任选）：
   - **自动保存**：用户每次改完就保存（最稳，本仓库示范用的就是这个）。
   - **显式保存按钮**：用户点保存才存。
   - **debounce 自动保存**：300ms 后保存（适合连续输入的场景）。

5. **质检模式（`mode=review`）**：
   - 用 `getTaskResult { taskId, sampleType: 1 }` 把标注员填的结果**只读**地渲染出来。
   - 所有输入控件 `disabled`，**不要**调 `saveTaskResult`。
   - 父框架顶栏会让质检员点「通过 / 驳回」。

6. **页面不需要做的事**：
   - 不需要顶栏（父框架已经有）。
   - 不需要"提交"按钮（父框架做）。
   - 不需要鉴权（一期接口信任 iframe 链路）。
   - 不需要 postMessage 跟父框架通信。

---

## 六、完整示范：用户评价情绪判断

本仓库已经内置一个完整可跑的示范页面，业务方可以照着抄。

| 项 | 值 |
|---|---|
| 业务场景 | 用户写了一段评价，判断「积极 / 非积极」 |
| 页面 URL（开发环境） | `http://localhost:5173/external/sentiment` |
| 源码 | `src/features/external/SentimentLabelPage.tsx` |

### 6.1 注册标注工具时填的 `labelToolJsonSchema`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id":      { "type": "string" },
    "bizId":   { "type": "string" },
    "content": { "type": "string" }
  },
  "required": ["id", "bizId", "content"]
}
```

### 6.2 结果 schema（`label_result_schema`，平台不校验，团队内约定）

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "sentiment": {
      "type": "string",
      "enum": ["positive", "negative"]
    }
  },
  "required": ["sentiment"]
}
```

人工标注页保存出来的样子：

```json
{ "sentiment": "positive" }
```

AI 预标注产出的样子（要跟上面**完全一致**，否则后续会乱）：

```json
{ "sentiment": "negative" }
```

### 6.3 测试数据集（10 条 JSONL，每行一条）

把下面内容存成 `sentiment-demo.jsonl`，按平台「创建数据集」流程上传：

```jsonl
{"id":"r-001","bizId":"r-001","content":"刚收到，质量很惊喜，包装也很精致，性价比直接拉满。"}
{"id":"r-002","bizId":"r-002","content":"用了三天就坏了，客服一直在踢皮球，再也不会买了。"}
{"id":"r-003","bizId":"r-003","content":"快递太慢，等了快两周才收到，体验非常差。"}
{"id":"r-004","bizId":"r-004","content":"颜值在线，手感也不错，已经推荐给同事了。"}
{"id":"r-005","bizId":"r-005","content":"虚假宣传，到手货跟图片完全不一样，垃圾。"}
{"id":"r-006","bizId":"r-006","content":"用了一周，续航比上一代好太多，强烈推荐。"}
{"id":"r-007","bizId":"r-007","content":"功能挺多，但是 App 一直闪退，体验劝退。"}
{"id":"r-008","bizId":"r-008","content":"店家服务态度真的好，有问题秒回，五星好评。"}
{"id":"r-009","bizId":"r-009","content":"价格不便宜，效果也就一般，没什么惊喜。"}
{"id":"r-010","bizId":"r-010","content":"做工细节非常好，按键反馈很舒服，赞。"}
```

### 6.4 AI 预标注 Prompt（配置 AI 时用）

```text
你是文本情绪二分类标注员。读用户给出的"用户评价"，判断这段评价的整体情绪：
- 表达满意 / 推荐 / 称赞 / 收获感等正向情绪 → "positive"
- 表达不满 / 抱怨 / 失望 / 投诉等负向情绪 → "negative"

输出**只**一段 JSON，不要 Markdown、不要解释、不要前后缀文本：

{"sentiment":"positive"}

或

{"sentiment":"negative"}

`sentiment` 只能是 "positive" 或 "negative"。如果评价含义模糊（如纯描述事实、表达中立），请按"用户会不会再次购买"作为偏置依据：会推荐 → positive，犹豫或否定 → negative。
```

---

## 七、自检清单（接入前过一遍）

- [ ] 我的页面打开 `?taskId=123` 能正确加载样本。
- [ ] 我的页面打开 `?taskId=123&mode=review` 是只读的。
- [ ] 我的页面不会自己调 `submitLabelTask` / `submitReviewTask`。
- [ ] 我注册时填的 `labelToolJsonSchema` 顶层 key 都是 JSON Schema 关键字。
- [ ] 我跟数据平台 / AI 配置 / 质检方约定好了 `result` 字段结构。
- [ ] 跨域 cookie / X-Frame-Options：我的页面允许被任意来源 iframe 嵌入。
