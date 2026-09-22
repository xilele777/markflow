// 标注工具领域服务（对应 Java LabelToolDomainServiceImpl；规则见后端索引 §3.4 / §2.6）。
// 标注工具是全局资源：创建仅系统管理员；查看为系统管理员 或 任意空间 LABEL_ADMIN。
import { isUniqueViolation } from '../../infra/db.js';
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import { compileJsonSchema, isPlainObject, JsonSchemaError } from '../../infra/json-schema.js';
import type { RedisLock } from '../../infra/lock.js';
import type { Operator } from '../common/operator.js';
import { emptyPage, normalizePage, type PageInput, type PageResult } from '../common/pagination.js';
import type { PermissionService } from '../common/permission.js';
import { isBlank, type Maybe } from '../common/strings.js';
import { isLabelToolTypeCode, LabelToolType } from './enums.js';
import { LabelToolErrorCode } from './error-codes.js';
import { DELETED_NO, type LabelToolRepository } from './labeltool.repo.js';

/** labelToolCode：4-32 位 [a-z0-9_-]。 */
const CODE_PATTERN = /^[a-z0-9_-]{4,32}$/;
const NAME_MIN_LENGTH = 4;
const NAME_MAX_LENGTH = 32;

export interface CreateLabelToolInput {
  labelToolCode?: Maybe<string>;
  labelToolName?: Maybe<string>;
  labelToolType?: Maybe<number>;
  labelToolUrl?: Maybe<string>;
  labelToolJsonSchema?: unknown;
  labelToolPageSchema?: unknown;
}

export interface LabelToolListInput extends PageInput {
  keyword?: Maybe<string>;
}

export interface LabelToolListItem {
  labelToolId: number;
  labelToolCode: string;
  labelToolName: string;
  labelToolType: number;
}

export interface LabelToolDetail extends LabelToolListItem {
  labelToolUrl: string | null;
  labelToolJsonSchema: unknown;
  labelToolPageSchema: unknown;
  creator: string | null;
  createTime: number;
}

export interface LabelToolServiceDeps {
  labelTools: LabelToolRepository;
  permissions: PermissionService;
  lock: RedisLock;
}

export class LabelToolService {
  constructor(private readonly deps: LabelToolServiceDeps) {}

  /**
   * 顺序与 Java 一致：type 非 1/2（Controller 边界）→ 系统管理员 → code/name/url/schema 校验 → 锁内查重。
   * schema 必须是对象且能按 Draft-07 编译（未知关键字即报错，防止把样本误当 schema）。pageSchema 透传不校验。
   */
  async createLabelTool(
    operator: Operator,
    input: CreateLabelToolInput,
  ): Promise<{ labelToolId: number }> {
    const labelToolType = input.labelToolType;
    if (!isLabelToolTypeCode(labelToolType)) {
      throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_TYPE_INVALID);
    }
    await this.deps.permissions.checkIsSystemAdmin(operator.userId);

    const { labelToolCode, labelToolName, labelToolUrl } = input;
    if (typeof labelToolCode !== 'string' || !CODE_PATTERN.test(labelToolCode)) {
      throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_CODE_INVALID);
    }
    if (
      typeof labelToolName !== 'string' ||
      labelToolName.length < NAME_MIN_LENGTH ||
      labelToolName.length > NAME_MAX_LENGTH
    ) {
      throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_NAME_INVALID);
    }
    if (labelToolType === LabelToolType.IFRAME && isBlank(labelToolUrl)) {
      throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_URL_INVALID);
    }
    const jsonSchema = input.labelToolJsonSchema;
    if (!isPlainObject(jsonSchema)) {
      throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_JSON_SCHEMA_INVALID);
    }
    try {
      compileJsonSchema(jsonSchema);
    } catch (err) {
      if (err instanceof JsonSchemaError) {
        throw ServiceError.of(
          LabelToolErrorCode.LABEL_TOOL_JSON_SCHEMA_INVALID,
          `labelToolJsonSchema 不是合法的 JSON Schema（Draft-07）：${err.message}`,
        );
      }
      throw err;
    }
    const pageSchema = input.labelToolPageSchema;

    const labelToolId = await this.deps.lock.withLock(
      `labelTool:create:${labelToolCode}`,
      LabelToolErrorCode.OPERATION_CONFLICT,
      async () => {
        if (await this.deps.labelTools.selectByCode(labelToolCode)) {
          throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_CODE_EXISTS);
        }
        const now = Date.now();
        try {
          return await this.deps.labelTools.insert({
            labelToolCode,
            labelToolName,
            labelToolType,
            labelToolUrl: labelToolUrl ?? null,
            labelToolJsonSchema: JSON.stringify(jsonSchema),
            labelToolPageSchema:
              pageSchema === undefined || pageSchema === null ? null : JSON.stringify(pageSchema),
            deleted: DELETED_NO,
            ext: null,
            creator: operator.username,
            operator: operator.username,
            createTime: now,
            updateTime: now,
          });
        } catch (err) {
          if (isUniqueViolation(err, 'uk_label_tool_code')) {
            throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_CODE_EXISTS);
          }
          throw err;
        }
      },
    );
    return { labelToolId };
  }

  async getLabelToolList(
    operatorId: number,
    input: LabelToolListInput,
  ): Promise<PageResult<LabelToolListItem>> {
    await this.deps.permissions.checkCanViewGlobalAssets(operatorId);
    const page = normalizePage(input);
    const total = await this.deps.labelTools.countByCondition(input.keyword);
    if (total === 0) return emptyPage(page);
    const rows = await this.deps.labelTools.selectByCondition(
      input.keyword,
      page.offset,
      page.pageSize,
    );
    return {
      list: rows.map((t) => ({
        labelToolId: t.id,
        labelToolCode: t.labelToolCode,
        labelToolName: t.labelToolName,
        labelToolType: t.labelToolType,
      })),
      total,
      pageNum: page.pageNum,
      pageSize: page.pageSize,
    };
  }

  async getLabelToolDetail(
    operatorId: number,
    input: { labelToolId?: Maybe<number> },
  ): Promise<LabelToolDetail> {
    await this.deps.permissions.checkCanViewGlobalAssets(operatorId);
    if (typeof input.labelToolId !== 'number') {
      throw ServiceError.of(CommonErrorCode.PARAM_INVALID, 'labelToolId 不能为空');
    }
    const tool = await this.deps.labelTools.selectById(input.labelToolId);
    if (!tool || tool.deleted !== DELETED_NO) {
      throw ServiceError.of(LabelToolErrorCode.LABEL_TOOL_NOT_FOUND);
    }
    return {
      labelToolId: tool.id,
      labelToolCode: tool.labelToolCode,
      labelToolName: tool.labelToolName,
      labelToolType: tool.labelToolType,
      labelToolUrl: tool.labelToolUrl,
      labelToolJsonSchema: tool.labelToolJsonSchema,
      labelToolPageSchema: tool.labelToolPageSchema,
      creator: tool.creator,
      createTime: tool.createTime,
    };
  }
}
