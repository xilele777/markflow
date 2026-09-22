import type { SelectQueryBuilder } from 'kysely';
import type { Database, NewWorkspace, WorkspaceRow } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import { hasText, likePattern, type Maybe } from '../common/strings.js';

type WorkspaceQuery<O> = SelectQueryBuilder<Database, 'workspace', O>;

/** 可见范围：null = 不限（系统管理员）；数组 = 仅这些空间 ID（普通用户）。 */
export type WorkspaceScope = readonly number[] | null;

export class WorkspaceRepository {
  constructor(private readonly db: Db) {}

  selectById(id: number): Promise<WorkspaceRow | undefined> {
    return this.db.selectFrom('workspace').selectAll().where('id', '=', id).executeTakeFirst();
  }

  selectByIds(ids: readonly number[]): Promise<WorkspaceRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('workspace')
      .selectAll()
      .where('id', 'in', [...ids])
      .execute();
  }

  /** space_code 为 citext，大小写不敏感。 */
  selectBySpaceCode(spaceCode: string): Promise<WorkspaceRow | undefined> {
    return this.db
      .selectFrom('workspace')
      .selectAll()
      .where('spaceCode', '=', spaceCode)
      .executeTakeFirst();
  }

  async insert(workspace: NewWorkspace): Promise<number> {
    const row = await this.db
      .insertInto('workspace')
      .values(workspace)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** keyword 模糊匹配 space_code / name。 */
  async countByCondition(scope: WorkspaceScope, keyword: Maybe<string>): Promise<number> {
    if (scope !== null && scope.length === 0) return 0;
    const row = await this.withCondition(
      this.db.selectFrom('workspace').select(({ fn }) => fn.countAll<number>().as('n')),
      scope,
      keyword,
    ).executeTakeFirstOrThrow();
    return row.n;
  }

  /** 按 create_time、id 降序分页。 */
  selectByCondition(
    scope: WorkspaceScope,
    keyword: Maybe<string>,
    offset: number,
    limit: number,
  ): Promise<WorkspaceRow[]> {
    if (scope !== null && scope.length === 0) return Promise.resolve([]);
    return this.withCondition(this.db.selectFrom('workspace').selectAll(), scope, keyword)
      .orderBy('createTime', 'desc')
      .orderBy('id', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();
  }

  private withCondition<O>(
    query: WorkspaceQuery<O>,
    scope: WorkspaceScope,
    keyword: Maybe<string>,
  ): WorkspaceQuery<O> {
    let q = query;
    if (scope !== null) q = q.where('id', 'in', [...scope]);
    if (hasText(keyword)) {
      const pattern = likePattern(keyword);
      q = q.where((eb) => eb.or([eb('spaceCode', 'ilike', pattern), eb('name', 'ilike', pattern)]));
    }
    return q;
  }
}
