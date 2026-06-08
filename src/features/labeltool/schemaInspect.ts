// 从后端下发的 labelToolJsonSchema / labelToolPageSchema 推导「字段清单」，给详情抽屉做格式预览。
// 设计目标：不显示数据本身、只显示「字段名 + 类型 + 选项 / 必填」，让业务方 / AI / 接入方一眼看清。

/** 字段清单条目。type 用 JSON Schema 词汇（string/number/integer/boolean/array/object）。 */
export interface SchemaField {
  name: string;
  type: string;
  /** array 时是 items 类型（如 'array<string>'）。 */
  itemsType?: string;
  /** 取值枚举（来自 enum 或选项 options）。 */
  enum?: string[];
  /** 是否必填（输入字段一律视为必填）。 */
  required?: boolean;
  /** 备注（rate 的范围 / multiline 等）。 */
  note?: string;
}

// —— 一、源数据 schema（labelToolJsonSchema）→ 输入字段清单 ————————————————

/** 解析 labelToolJsonSchema（Draft-07）顶层 properties + required → 平铺字段表。
 *  只看顶层；嵌套子结构暂不展开（业务上数据样本一般也是一层）。 */
export function parseInputFields(jsonSchema: Record<string, unknown> | null | undefined): SchemaField[] {
  if (!jsonSchema || typeof jsonSchema !== 'object') return [];
  const properties = (jsonSchema as { properties?: Record<string, unknown> }).properties;
  if (!properties || typeof properties !== 'object') return [];
  const required = new Set(
    Array.isArray((jsonSchema as { required?: unknown }).required)
      ? ((jsonSchema as { required: string[] }).required)
      : [],
  );

  const out: SchemaField[] = [];
  for (const key of Object.keys(properties)) {
    const sub = properties[key] as Record<string, unknown> | undefined;
    if (!sub || typeof sub !== 'object') continue;
    const type = typeof sub.type === 'string' ? sub.type : 'any';
    const field: SchemaField = { name: key, type, required: required.has(key) };
    if (type === 'array') {
      const items = sub.items as { type?: string } | undefined;
      field.itemsType = items?.type ?? 'any';
      field.type = `array<${field.itemsType}>`;
    }
    if (Array.isArray(sub.enum)) field.enum = sub.enum.map(String);
    out.push(field);
  }
  return out;
}

// —— 二、Puck pageSchema → 输出字段清单 ———————————————————————————

/** Puck Data 的最小形状（content + zones）。 */
interface PuckEntry {
  type: string;
  props?: Record<string, unknown>;
}
interface PuckData {
  content?: PuckEntry[];
  zones?: Record<string, PuckEntry[]>;
}

/** 遍历 Puck Data 拿到所有 entry（content + 所有 zones）。 */
function walkEntries(data: Record<string, unknown> | null | undefined): PuckEntry[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as PuckData;
  const all: PuckEntry[] = [];
  if (Array.isArray(d.content)) all.push(...d.content);
  if (d.zones && typeof d.zones === 'object') {
    for (const z of Object.values(d.zones)) {
      if (Array.isArray(z)) all.push(...z);
    }
  }
  return all;
}

/** 从单个 entry 推 SchemaField；非输入类返回 null。 */
function entryToField(entry: PuckEntry): SchemaField | null {
  const props = entry.props ?? {};
  const resultKey = typeof props.resultKey === 'string' ? props.resultKey.trim() : '';
  if (!resultKey) return null; // 没绑字段的输入组件忽略（搭建中状态）

  // 取选项 label 列表（如 SegmentInput / RadioInput / CheckboxInput / SelectInput）。
  const opts = Array.isArray(props.options)
    ? (props.options as Array<{ label?: unknown }>)
        .map((o) => (typeof o?.label === 'string' ? o.label : null))
        .filter((s): s is string => !!s)
    : [];

  switch (entry.type) {
    case 'TextInput': {
      const multi = props.multiline === true;
      return { name: resultKey, type: 'string', required: true, note: multi ? '多行文本' : undefined };
    }
    case 'SegmentInput':
    case 'RadioInput':
    case 'SelectInput':
      return { name: resultKey, type: 'string', required: true, enum: opts };
    case 'CheckboxInput':
      return {
        name: resultKey,
        type: 'array<string>',
        itemsType: 'string',
        required: true,
        enum: opts,
        note: '多选',
      };
    case 'BooleanInput':
      return { name: resultKey, type: 'boolean', required: true };
    case 'RateInput': {
      const allowHalf = props.allowHalf === true;
      const count = typeof props.count === 'number' ? props.count : 5;
      return {
        name: resultKey,
        type: allowHalf ? 'number' : 'integer',
        required: true,
        note: `0 ~ ${count}${allowHalf ? '（允许半星）' : ''}`,
      };
    }
    default:
      return null;
  }
}

/** 解析 labelToolPageSchema（Puck Data）→ 平铺输出字段表。同 resultKey 去重，先出现的赢。 */
export function deriveOutputFields(pageSchema: Record<string, unknown> | null | undefined): SchemaField[] {
  const entries = walkEntries(pageSchema);
  const out: SchemaField[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const f = entryToField(entry);
    if (!f) continue;
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    out.push(f);
  }
  return out;
}

// —— 三、AI 提示词模板 ————————————————————————————————————————
// 根据「输入字段 + 输出字段」自动拼出预标注 / 预审核两份模板，业务语义留 **{{...}}** 占位让用户补。
// 双星号包裹是为了视觉醒目，markdown 渲染也会加粗。

/** 占位标记：前后 ** 包裹的 {{}}，视觉醒目易识别。 */
const FILL = (hint: string) => `**{{${hint}}}**`;

/** 单字段说明行（用于 prompt）。 */
function fieldLineForPrompt(f: SchemaField): string {
  const meta: string[] = [f.type];
  if (f.required) meta.push('必填');
  if (f.enum && f.enum.length > 0) meta.push(`取值: ${f.enum.join(' / ')}`);
  if (f.note) meta.push(f.note);
  return `- ${f.name} (${meta.join(', ')})：${FILL('字段含义')}`;
}

/** 给定输出字段，构造一行示例 JSON 骨架。enum 字段取首项、其它给类型默认值。 */
function exampleJsonFor(fields: SchemaField[]): string {
  const obj: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type.startsWith('array')) obj[f.name] = [];
    else if (f.type === 'boolean') obj[f.name] = false;
    else if (f.type === 'integer' || f.type === 'number') obj[f.name] = 0;
    else if (f.enum && f.enum.length > 0) obj[f.name] = f.enum[0];
    else obj[f.name] = '';
  }
  return JSON.stringify(obj);
}

/** 预标注 Prompt 模板。输入：工具名 + 输入/输出字段表；占位 **{{...}}** 让用户补语义。 */
export function derivePreLabelPrompt(
  labelToolName: string,
  inputFields: SchemaField[],
  outputFields: SchemaField[],
): string {
  const inputs = inputFields.length > 0 ? inputFields.map(fieldLineForPrompt).join('\n') : '- （无字段）';
  const outputs = outputFields.length > 0 ? outputFields.map(fieldLineForPrompt).join('\n') : '- （无字段）';
  const example = outputFields.length > 0 ? exampleJsonFor(outputFields) : '{}';
  return `你是「${labelToolName}」的标注员。任务：根据输入数据生成标注结果。

【业务背景】
${FILL('描述这条数据是什么 / 来自什么场景')}

【输入字段】
${inputs}

【输出 JSON 结构】
${outputs}

【输出示例】
${example}

【规则】
1. 严格按字段类型 / enum 取值输出，不要超出。
2. 不要 Markdown、不要解释、不要前后缀文本，只输出 JSON。
3. ${FILL('特殊规则 / 偏置依据，可留空')}`;
}

/** 预审核 Prompt 模板。输入：工具名 + 输入/输出字段表；占位让用户补判定规则。 */
export function derivePreReviewPrompt(
  labelToolName: string,
  inputFields: SchemaField[],
  outputFields: SchemaField[],
): string {
  const inputs = inputFields.length > 0 ? inputFields.map(fieldLineForPrompt).join('\n') : '- （无字段）';
  const outputs = outputFields.length > 0 ? outputFields.map(fieldLineForPrompt).join('\n') : '- （无字段）';
  return `你是「${labelToolName}」的质检员。任务：审核标注员对输入数据产出的标注结果，决定通过或驳回。

【业务背景】
${FILL('描述这条数据是什么 / 来自什么场景')}

【输入字段】（同标注端）
${inputs}

【待审核的标注结果】（标注员产出的字段）
${outputs}

【输出 JSON 结构】
{"reviewAction": 0 | 1, "reviewComment": "..."}

- reviewAction：0=驳回，1=通过
- reviewComment：驳回时必须给出具体问题；通过可留空。

【判定规则】
${FILL('什么情况判通过 / 驳回，例：reason 留空又选了优秀 → 驳回')}
${FILL('对各字段的硬性约束补充，可留空')}

【规则】
1. 严格输出 JSON 对象，不要 Markdown、不要前后缀。
2. 字段类型必须满足约束。`;
}
