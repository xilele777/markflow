// AI 配置领域服务（对应 Java AiConfigDomainServiceImpl；规则见后端索引 §3.5 / §2.3）。
// 整个列表以 JSON 数组存于 sys_config[ai.configList] 单行，create/update 为整行读改写，用全局锁 aiConfig:list 串行化。
// 与 Java 的差异：apiKey 以 AES-256-GCM 密文落库（SecretBox），只在内部 getAiConfigByCode 解密；接口永不出参。
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import type { RedisLock } from '../../infra/lock.js';
import { SecretBox } from '../../infra/secret-box.js';
import { SYS_CONFIG_KEYS, SysConfigType, type SysConfigService } from '../../infra/sys-config.js';
import type { Operator } from '../common/operator.js';
import type { PermissionService } from '../common/permission.js';
import { hasText, isBlank, type Maybe } from '../common/strings.js';
import { LabelToolErrorCode } from '../labeltool/error-codes.js';
import type { LabelToolRepository } from '../labeltool/labeltool.repo.js';
import { AiConfigErrorCode } from './error-codes.js';

/** aiCode：4-32 位 [a-z0-9_-]。 */
const CODE_PATTERN = /^[a-z0-9_-]{4,32}$/;
const NAME_MIN_LENGTH = 4;
const NAME_MAX_LENGTH = 32;
const CONFIG_NAME = 'AI 配置列表';
const LOCK_NAME = 'aiConfig:list';

/** sys_config 中 JSON 数组元素的存储结构；apiKey 为密文（或历史明文）。 */
export interface AiConfigRecord {
  aiCode: string;
  name: string;
  labelToolCode: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}

export interface AiConfigListItem {
  aiCode: string;
  name: string;
  labelToolCode: string;
  baseUrl: string | null;
  model: string | null;
  prompt: string | null;
}

export interface CreateAiConfigInput {
  aiCode?: Maybe<string>;
  name?: Maybe<string>;
  labelToolCode?: Maybe<string>;
  baseUrl?: Maybe<string>;
  apiKey?: Maybe<string>;
  model?: Maybe<string>;
  prompt?: Maybe<string>;
}

export interface UpdateAiConfigInput {
  aiCode?: Maybe<string>;
  name?: Maybe<string>;
  baseUrl?: Maybe<string>;
  apiKey?: Maybe<string>;
  model?: Maybe<string>;
  prompt?: Maybe<string>;
}

export interface AiConfigServiceDeps {
  sysConfig: SysConfigService;
  secretBox: SecretBox;
  permissions: PermissionService;
  labelTools: LabelToolRepository;
  lock: RedisLock;
}

export class AiConfigService {
  constructor(private readonly deps: AiConfigServiceDeps) {}

  /** 系统管理员；全部字段必填；labelToolCode 必须存在；锁内查重 → AI_CODE_EXISTS。 */
  async createAiConfig(operator: Operator, input: CreateAiConfigInput): Promise<void> {
    await this.deps.permissions.checkIsSystemAdmin(operator.userId);
    const record = validateCreateParam(input);
    if (!(await this.deps.labelTools.selectByCode(record.labelToolCode))) {
      throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_NOT_FOUND);
    }
    await this.deps.lock.withLock(LOCK_NAME, AiConfigErrorCode.OPERATION_CONFLICT, async () => {
      const list = await this.readList();
      if (findByCode(list, record.aiCode)) throw ServiceError.of(AiConfigErrorCode.AI_CODE_EXISTS);
      list.push({ ...record, apiKey: this.deps.secretBox.encrypt(record.apiKey) });
      await this.saveList(list, operator.username);
    });
  }

  /** 系统管理员；局部更新：仅覆盖非空白字段（apiKey 不传则保留）；labelToolCode 不可变更。name 传入时才校验长度（在定位到配置之后，与 Java 顺序一致）。 */
  async updateAiConfig(operator: Operator, input: UpdateAiConfigInput): Promise<void> {
    await this.deps.permissions.checkIsSystemAdmin(operator.userId);
    const aiCode = validateAiCode(input.aiCode);
    await this.deps.lock.withLock(LOCK_NAME, AiConfigErrorCode.OPERATION_CONFLICT, async () => {
      const list = await this.readList();
      const target = findByCode(list, aiCode);
      if (!target) throw ServiceError.of(AiConfigErrorCode.AI_CONFIG_NOT_FOUND);
      if (hasText(input.name)) target.name = validateName(input.name);
      if (hasText(input.baseUrl)) target.baseUrl = input.baseUrl;
      if (hasText(input.apiKey)) target.apiKey = this.deps.secretBox.encrypt(input.apiKey);
      if (hasText(input.model)) target.model = input.model;
      if (hasText(input.prompt)) target.prompt = input.prompt;
      await this.saveList(list, operator.username);
    });
  }

  /** 系统管理员 或 任意空间 LABEL_ADMIN；非系统管理员看不到 baseUrl / model / prompt；apiKey 永不出参。 */
  async getAiConfigList(
    operatorId: number,
    input: { labelToolCode?: Maybe<string> },
  ): Promise<{ list: AiConfigListItem[] }> {
    const systemAdmin = await this.deps.permissions.isSystemAdmin(operatorId);
    if (!systemAdmin) await this.deps.permissions.checkIsLabelAdminOfAnyWorkspace(operatorId);

    const filter = hasText(input.labelToolCode) ? input.labelToolCode.toLowerCase() : null;
    const list = (await this.readList())
      .filter((c) => filter === null || c.labelToolCode.toLowerCase() === filter)
      .map((c) => ({
        aiCode: c.aiCode,
        name: c.name,
        labelToolCode: c.labelToolCode,
        baseUrl: systemAdmin ? c.baseUrl : null,
        model: systemAdmin ? c.model : null,
        prompt: systemAdmin ? c.prompt : null,
      }));
    return { list };
  }

  /** 内部使用（M3 AI 执行器）：含解密后的 apiKey；不存在返回 null。 */
  async getAiConfigByCode(aiCode: string): Promise<AiConfigRecord | null> {
    const found = findByCode(await this.readList(), aiCode);
    if (!found) return null;
    return { ...found, apiKey: this.deps.secretBox.decrypt(found.apiKey) };
  }

  private async readList(): Promise<AiConfigRecord[]> {
    const content = await this.deps.sysConfig.getOrNull(SYS_CONFIG_KEYS.aiConfigList);
    if (!hasText(content)) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw ServiceError.of(
        CommonErrorCode.SYSTEM_ERROR,
        `系统配置 ${SYS_CONFIG_KEYS.aiConfigList} 不是合法 JSON`,
        {
          cause: err,
        },
      );
    }
    if (!Array.isArray(parsed)) {
      throw ServiceError.of(
        CommonErrorCode.SYSTEM_ERROR,
        `系统配置 ${SYS_CONFIG_KEYS.aiConfigList} 应为 JSON 数组`,
      );
    }
    return parsed.map(toRecord);
  }

  /** 落库前确保每条 apiKey 都是密文（顺带把历史明文加密）。 */
  private async saveList(list: AiConfigRecord[], operator: string): Promise<void> {
    const stored = list.map((c) => ({
      ...c,
      apiKey: SecretBox.isEncrypted(c.apiKey) ? c.apiKey : this.deps.secretBox.encrypt(c.apiKey),
    }));
    await this.deps.sysConfig.saveOrUpdate(
      SYS_CONFIG_KEYS.aiConfigList,
      CONFIG_NAME,
      SysConfigType.JSON,
      JSON.stringify(stored),
      operator,
    );
  }
}

function findByCode(list: AiConfigRecord[], aiCode: string): AiConfigRecord | undefined {
  return list.find((c) => c.aiCode === aiCode);
}

/** 与 Jackson 反序列化一致：未知字段忽略、缺失字段为空。 */
function toRecord(raw: unknown): AiConfigRecord {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const str = (key: keyof AiConfigRecord): string =>
    typeof obj[key] === 'string' ? (obj[key] as string) : '';
  return {
    aiCode: str('aiCode'),
    name: str('name'),
    labelToolCode: str('labelToolCode'),
    baseUrl: str('baseUrl'),
    apiKey: str('apiKey'),
    model: str('model'),
    prompt: str('prompt'),
  };
}

function validateAiCode(aiCode: Maybe<string>): string {
  if (typeof aiCode !== 'string' || !CODE_PATTERN.test(aiCode)) {
    throw ServiceError.of(AiConfigErrorCode.AI_CODE_INVALID);
  }
  return aiCode;
}

function validateName(name: Maybe<string>): string {
  if (typeof name !== 'string' || name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    throw ServiceError.of(AiConfigErrorCode.AI_NAME_INVALID);
  }
  return name;
}

function requireNonBlank(value: Maybe<string>, message: string): string {
  if (isBlank(value)) throw ServiceError.of(AiConfigErrorCode.AI_CONFIG_FIELD_REQUIRED, message);
  return value as string;
}

function validateCreateParam(input: CreateAiConfigInput): AiConfigRecord {
  return {
    aiCode: validateAiCode(input.aiCode),
    name: validateName(input.name),
    labelToolCode: requireNonBlank(input.labelToolCode, 'labelToolCode 不能为空'),
    baseUrl: requireNonBlank(input.baseUrl, 'baseUrl 不能为空'),
    apiKey: requireNonBlank(input.apiKey, 'apiKey 不能为空'),
    model: requireNonBlank(input.model, 'model 不能为空'),
    prompt: requireNonBlank(input.prompt, 'prompt 不能为空'),
  };
}
