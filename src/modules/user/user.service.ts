// 用户领域服务（M0 仅 getCurrentUser；create / list / changePassword / contribution 在 M1）。
import { ServiceError } from '../../infra/errors.js';
import { workspaceRoleName, type WorkspaceRoleName } from '../workspace/enums.js';
import { UserStatus } from './enums.js';
import { UserErrorCode } from './error-codes.js';
import type { UserRepository } from './user.repo.js';

export interface CurrentUserWorkspace {
  workspaceId: number;
  spaceCode: string;
  name: string;
  roles: WorkspaceRoleName[];
}

export interface CurrentUser {
  userId: number;
  username: string;
  displayName: string;
  isSystemAdmin: boolean;
  workspaces: CurrentUserWorkspace[];
}

export class UserService {
  constructor(private readonly users: UserRepository) {}

  /** 对应 Java UserDomainServiceImpl.getCurrentUser：用户不存在 → USER_INVALID；禁用 → USER_DISABLED。 */
  async getCurrentUser(userId: number): Promise<CurrentUser> {
    const user = await this.users.selectById(userId);
    if (!user) throw ServiceError.of(UserErrorCode.USER_INVALID);
    if (user.status === UserStatus.DISABLED) throw ServiceError.of(UserErrorCode.USER_DISABLED);

    const byWorkspace = new Map<number, CurrentUserWorkspace>();
    for (const m of await this.users.selectMemberships(userId)) {
      let item = byWorkspace.get(m.workspaceId);
      if (!item) {
        item = { workspaceId: m.workspaceId, spaceCode: m.spaceCode, name: m.name, roles: [] };
        byWorkspace.set(m.workspaceId, item);
      }
      item.roles.push(workspaceRoleName(m.roleInSpace));
    }

    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      isSystemAdmin: user.isSystemAdmin,
      workspaces: [...byWorkspace.values()],
    };
  }
}
