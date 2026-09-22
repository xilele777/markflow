// user_workspace_ship 仓储（对应 Java UserWorkspaceShipRepository）：(workspaceId, userId, role) 三元组一行。
import type { NewUserWorkspaceShip, UserWorkspaceShipRow } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';

export interface MembershipWithWorkspace {
  workspaceId: number;
  spaceCode: string;
  name: string;
  roleInSpace: number;
}

export class MembershipRepository {
  constructor(private readonly db: Db) {}

  selectByUserId(userId: number): Promise<UserWorkspaceShipRow[]> {
    return this.db
      .selectFrom('user_workspace_ship')
      .selectAll()
      .where('userId', '=', userId)
      .execute();
  }

  /** 用户在各空间的角色（一行一角色），带空间信息；按空间 ID、角色 code 升序；空间记录缺失的脏关系被 join 过滤。 */
  selectWithWorkspaceByUserId(userId: number): Promise<MembershipWithWorkspace[]> {
    return this.db
      .selectFrom('user_workspace_ship as s')
      .innerJoin('workspace as w', 'w.id', 's.workspaceId')
      .select(['w.id as workspaceId', 'w.spaceCode', 'w.name', 's.roleInSpace'])
      .where('s.userId', '=', userId)
      .orderBy('w.id')
      .orderBy('s.roleInSpace')
      .execute();
  }

  /** 空间全部关系，按加入时间（create_time）升序、id 升序。 */
  selectByWorkspaceId(workspaceId: number): Promise<UserWorkspaceShipRow[]> {
    return this.db
      .selectFrom('user_workspace_ship')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .orderBy('createTime')
      .orderBy('id')
      .execute();
  }

  /** 插入三元组；已存在（唯一键冲突）时不报错、返回 false。 */
  async insertIfAbsent(row: NewUserWorkspaceShip): Promise<boolean> {
    const result = await this.db
      .insertInto('user_workspace_ship')
      .values(row)
      .onConflict((oc) => oc.constraint('uk_user_workspace_ship_ws_user_role').doNothing())
      .executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
  }
}
