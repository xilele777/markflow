import type { SelectQueryBuilder } from 'kysely';
import type { CaseRow, Database, NewCase } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import { hasText, likePattern, type Maybe } from '../common/strings.js';
import type { CaseExt } from './config.js';

type CaseQuery<O> = SelectQueryBuilder<Database, 'label_case', O>;

export const DELETED_NO = 0;

/** 对应 Java CaseRepository。事务内用 withDb(trx)。 */
export class CaseRepository {
  constructor(private readonly db: Db) {}

  withDb(db: Db): CaseRepository {
    return new CaseRepository(db);
  }

  async insert(row: NewCase): Promise<number> {
    const inserted = await this.db
      .insertInto('label_case')
      .values(row)
      .returning('id')
      .executeTakeFirstOrThrow();
    return inserted.id;
  }

  /** 不过滤 deleted（与 Java 一致），由调用方判断。 */
  selectById(id: number): Promise<CaseRow | undefined> {
    return this.db.selectFrom('label_case').selectAll().where('id', '=', id).executeTakeFirst();
  }

  selectByIds(ids: readonly number[]): Promise<CaseRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('label_case')
      .selectAll()
      .where('id', 'in', [...ids])
      .execute();
  }

  /** 某空间下未删除 case 的 id 列表。 */
  async selectIdsBySpaceCode(spaceCode: string): Promise<number[]> {
    const rows = await this.db
      .selectFrom('label_case')
      .select('id')
      .where('spaceCode', '=', spaceCode)
      .where('deleted', '=', DELETED_NO)
      .execute();
    return rows.map((r) => r.id);
  }

  /** 同空间下未删除同名 case（name 为 citext，大小写不敏感）。 */
  async existsActiveBySpaceCodeAndName(spaceCode: string, name: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('label_case')
      .select('id')
      .where('spaceCode', '=', spaceCode)
      .where('name', '=', name)
      .where('deleted', '=', DELETED_NO)
      .executeTakeFirst();
    return row !== undefined;
  }

  async updateLabelResultDatasetVersionId(
    caseId: number,
    versionId: number,
    operator: string,
    updateTime: number,
  ): Promise<void> {
    await this.db
      .updateTable('label_case')
      .set({ labelResultDatasetVersionId: versionId, operator, updateTime })
      .where('id', '=', caseId)
      .execute();
  }

  /** 覆盖式更新 ext（整段重写）。 */
  async updateExt(
    caseId: number,
    ext: CaseExt,
    operator: string,
    updateTime: number,
  ): Promise<void> {
    await this.db
      .updateTable('label_case')
      .set({ ext: JSON.stringify(ext), operator, updateTime })
      .where('id', '=', caseId)
      .execute();
  }

  async countByCondition(
    spaceCode: string,
    status: Maybe<number>,
    keyword: Maybe<string>,
  ): Promise<number> {
    const row = await this.withCondition(
      this.db.selectFrom('label_case').select(({ fn }) => fn.countAll<number>().as('n')),
      spaceCode,
      status,
      keyword,
    ).executeTakeFirstOrThrow();
    return row.n;
  }

  /** create_time、id 降序分页。 */
  selectByCondition(
    spaceCode: string,
    status: Maybe<number>,
    keyword: Maybe<string>,
    offset: number,
    limit: number,
  ): Promise<CaseRow[]> {
    return this.withCondition(
      this.db.selectFrom('label_case').selectAll(),
      spaceCode,
      status,
      keyword,
    )
      .orderBy('createTime', 'desc')
      .orderBy('id', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();
  }

  private withCondition<O>(
    query: CaseQuery<O>,
    spaceCode: string,
    status: Maybe<number>,
    keyword: Maybe<string>,
  ): CaseQuery<O> {
    let q = query.where('spaceCode', '=', spaceCode).where('deleted', '=', DELETED_NO);
    if (status !== null && status !== undefined) q = q.where('status', '=', status);
    if (hasText(keyword)) q = q.where('name', 'ilike', likePattern(keyword));
    return q;
  }
}
