import type { SelectQueryBuilder } from 'kysely';
import type { Database, NewSysUser, SysUserRow } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import { hasText, likePattern, type Maybe } from '../common/strings.js';

type UserQuery<O> = SelectQueryBuilder<Database, 'sys_user', O>;

export class UserRepository {
  constructor(private readonly db: Db) {}

  selectById(id: number): Promise<SysUserRow | undefined> {
    return this.db.selectFrom('sys_user').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /** username 列为 citext，比较大小写不敏感（复刻 MySQL utf8mb4_general_ci）。 */
  selectByUsername(username: string): Promise<SysUserRow | undefined> {
    return this.db
      .selectFrom('sys_user')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst();
  }

  selectByIds(ids: readonly number[]): Promise<SysUserRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('sys_user')
      .selectAll()
      .where('id', 'in', [...ids])
      .execute();
  }

  async insert(user: NewSysUser): Promise<number> {
    const row = await this.db
      .insertInto('sys_user')
      .values(user)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** keyword 模糊匹配 username / displayName（大小写不敏感）；空则全部。 */
  async countByCondition(keyword: Maybe<string>): Promise<number> {
    const row = await this.withKeyword(
      this.db.selectFrom('sys_user').select(({ fn }) => fn.countAll<number>().as('n')),
      keyword,
    ).executeTakeFirstOrThrow();
    return row.n;
  }

  /** 按 create_time、id 降序分页。 */
  selectByCondition(keyword: Maybe<string>, offset: number, limit: number): Promise<SysUserRow[]> {
    return this.withKeyword(this.db.selectFrom('sys_user').selectAll(), keyword)
      .orderBy('createTime', 'desc')
      .orderBy('id', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();
  }

  async updatePassword(
    userId: number,
    passwordHash: string,
    operator: string,
    updateTime: number,
  ): Promise<void> {
    await this.db
      .updateTable('sys_user')
      .set({ passwordHash, operator, updateTime })
      .where('id', '=', userId)
      .execute();
  }

  private withKeyword<O>(query: UserQuery<O>, keyword: Maybe<string>): UserQuery<O> {
    if (!hasText(keyword)) return query;
    const pattern = likePattern(keyword);
    return query.where((eb) =>
      eb.or([eb('username', 'ilike', pattern), eb('displayName', 'ilike', pattern)]),
    );
  }
}
