import { sql, type SelectQueryBuilder } from 'kysely';
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

  /**
   * 合并式更新 ext：顶层键按 patch 覆盖（jsonb ||），未给的键保留；
   * patch 中值为 null 的键从 ext 删除（jsonb - text[]），兑现「要删除某键给 null」的语义
   * （R4，2026-09-25：此前 `||` 会保留 `{deadline: null}` 僵尸键，让截止扫描查询永久取回该行）。
   * 本 repo 仅被 case 服务使用，全部 null 语义均为「清除」，无兼容风险。
   */
  async updateExt(
    caseId: number,
    patch: CaseExt,
    operator: string,
    updateTime: number,
  ): Promise<void> {
    const nullKeys = Object.keys(patch).filter(
      (key) => (patch as Record<string, unknown>)[key] === null,
    );
    // Postgres 数组字面量 '{"a","b"}'；键名来自 CaseExt 固定键集，引号转义兜底。
    const nullKeysLiteral = `{${nullKeys
      .map((key) => `"${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
      .join(',')}}`;
    await this.db
      .updateTable('label_case')
      .set({
        ext:
          nullKeys.length > 0
            ? sql`(COALESCE(ext, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb) - ${nullKeysLiteral}::text[]`
            : sql`COALESCE(ext, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
        operator,
        updateTime,
      })
      .where('id', '=', caseId)
      .execute();
  }

  /** 条件更新状态（仅当当前为 fromStatus 之一）；返回影响行数，0 表示状态已变（竞态）。 */
  async updateStatus(
    caseId: number,
    fromStatuses: readonly number[],
    toStatus: number,
    operator: string,
    updateTime: number,
  ): Promise<number> {
    const result = await this.db
      .updateTable('label_case')
      .set({ status: toStatus, version: sql`version + 1`, operator, updateTime })
      .where('id', '=', caseId)
      .where('status', 'in', [...fromStatuses])
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /** 运行中且 ext.deadline 为数值的未删除 case（截止扫描用）。 */
  selectRunningWithDeadline(limit: number): Promise<CaseRow[]> {
    return (
      this.db
        .selectFrom('label_case')
        .selectAll()
        .where('status', '=', 2)
        .where('deleted', '=', DELETED_NO)
        // jsonb_typeof 而非键存在性：对历史 `{"deadline": null}` 僵尸数据免疫（R4 双修兜底）。
        .where(sql`jsonb_typeof(ext->'deadline')`, '=', sql.lit('number'))
        .orderBy('id')
        .limit(limit)
        .execute()
    );
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
