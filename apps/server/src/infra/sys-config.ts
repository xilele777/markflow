// sys_config 读写（对应 Java SysConfigDomainService）。
// 与 Java 不同：进程内缓存已读到的值，saveOrUpdate 后失效；避免每请求查库读 jwt.secret（后端索引 §9.5）。
import type { Db } from './db.js';
import { CommonErrorCode, ServiceError } from './errors.js';

export const SYS_CONFIG_KEYS = {
  jwtSecret: 'jwt.secret',
  jwtExpireSeconds: 'jwt.expireSeconds',
  tosConfig: 'tos.config',
  aiConfigList: 'ai.configList',
} as const;

/** SysConfigTypeEnum：STRING=1, JSON=2, YAML=3, CLASS_PATH=4 */
export const SysConfigType = { STRING: 1, JSON: 2, YAML: 3, CLASS_PATH: 4 } as const;
export type SysConfigTypeCode = (typeof SysConfigType)[keyof typeof SysConfigType];

const DELETED_NO = 0;

export class SysConfigService {
  private readonly cache = new Map<string, string>();

  constructor(private readonly db: Db) {}

  /** 缺失即 SYSTEM_ERROR（与 Java 一致：属于部署配置错误，不是业务错误）。 */
  async get(configKey: string): Promise<string> {
    const content = await this.getOrNull(configKey);
    if (content === null) {
      throw ServiceError.of(CommonErrorCode.SYSTEM_ERROR, `缺少系统配置: ${configKey}`);
    }
    return content;
  }

  async getOrNull(configKey: string): Promise<string | null> {
    const cached = this.cache.get(configKey);
    if (cached !== undefined) return cached;
    const row = await this.db
      .selectFrom('sys_config')
      .select('content')
      .where('configKey', '=', configKey)
      .where('deleted', '=', DELETED_NO)
      .executeTakeFirst();
    if (!row || row.content === null) return null;
    this.cache.set(configKey, row.content);
    return row.content;
  }

  async saveOrUpdate(
    configKey: string,
    configName: string,
    type: SysConfigTypeCode,
    content: string,
    operator: string,
  ): Promise<void> {
    const now = Date.now();
    const existing = await this.db
      .selectFrom('sys_config')
      .select('id')
      .where('configKey', '=', configKey)
      .executeTakeFirst();
    if (!existing) {
      await this.db
        .insertInto('sys_config')
        .values({
          configKey,
          configName,
          type,
          content,
          description: null,
          deleted: DELETED_NO,
          creator: operator,
          operator,
          createTime: now,
          updateTime: now,
        })
        .execute();
    } else {
      await this.db
        .updateTable('sys_config')
        .set({ content, operator, updateTime: now, deleted: DELETED_NO })
        .where('id', '=', existing.id)
        .execute();
    }
    this.cache.delete(configKey);
  }

  invalidate(configKey?: string): void {
    if (configKey === undefined) this.cache.clear();
    else this.cache.delete(configKey);
  }
}
