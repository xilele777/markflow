import type { SelectQueryBuilder } from 'kysely';
import type { Database, LabelToolRow, NewLabelTool } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import { hasText, likePattern, type Maybe } from '../common/strings.js';

type LabelToolQuery<O> = SelectQueryBuilder<Database, 'markflow_label_tool', O>;

export const DELETED_NO = 0;

export class LabelToolRepository {
  constructor(private readonly db: Db) {}

  withDb(db: Db): LabelToolRepository {
    return new LabelToolRepository(db);
  }

  /** 只查未删除；label_tool_code 为 citext，大小写不敏感。 */
  selectByCode(labelToolCode: string): Promise<LabelToolRow | undefined> {
    return this.db
      .selectFrom('markflow_label_tool')
      .selectAll()
      .where('labelToolCode', '=', labelToolCode)
      .where('deleted', '=', DELETED_NO)
      .executeTakeFirst();
  }

  /** 不过滤 deleted（与 Java selectById 一致），由调用方判断。 */
  selectById(id: number): Promise<LabelToolRow | undefined> {
    return this.db
      .selectFrom('markflow_label_tool')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async insert(labelTool: NewLabelTool): Promise<number> {
    const row = await this.db
      .insertInto('markflow_label_tool')
      .values(labelTool)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** 未删除工具总数；keyword 模糊匹配 code / name。 */
  async countByCondition(keyword: Maybe<string>): Promise<number> {
    const row = await this.withCondition(
      this.db.selectFrom('markflow_label_tool').select(({ fn }) => fn.countAll<number>().as('n')),
      keyword,
    ).executeTakeFirstOrThrow();
    return row.n;
  }

  /** 按 create_time、id 降序分页。 */
  selectByCondition(
    keyword: Maybe<string>,
    offset: number,
    limit: number,
  ): Promise<LabelToolRow[]> {
    return this.withCondition(this.db.selectFrom('markflow_label_tool').selectAll(), keyword)
      .orderBy('createTime', 'desc')
      .orderBy('id', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();
  }

  private withCondition<O>(query: LabelToolQuery<O>, keyword: Maybe<string>): LabelToolQuery<O> {
    let q = query.where('deleted', '=', DELETED_NO);
    if (hasText(keyword)) {
      const pattern = likePattern(keyword);
      q = q.where((eb) =>
        eb.or([eb('labelToolCode', 'ilike', pattern), eb('labelToolName', 'ilike', pattern)]),
      );
    }
    return q;
  }
}
