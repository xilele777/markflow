import type { Db } from '../../infra/db.js';
import type { NewSysUser, SysUserRow } from '../../db/schema.js';

export interface WorkspaceMembership {
  workspaceId: number;
  spaceCode: string;
  name: string;
  roleInSpace: number;
}

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

  async insert(user: NewSysUser): Promise<number> {
    const row = await this.db
      .insertInto('sys_user')
      .values(user)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** 用户在各空间的角色（一行一角色）；按空间 ID、角色 code 升序，空间记录缺失的关系行自然被 join 过滤。 */
  selectMemberships(userId: number): Promise<WorkspaceMembership[]> {
    return this.db
      .selectFrom('user_workspace_ship as s')
      .innerJoin('workspace as w', 'w.id', 's.workspaceId')
      .select(['w.id as workspaceId', 'w.spaceCode', 'w.name', 's.roleInSpace'])
      .where('s.userId', '=', userId)
      .orderBy('w.id')
      .orderBy('s.roleInSpace')
      .execute();
  }
}
