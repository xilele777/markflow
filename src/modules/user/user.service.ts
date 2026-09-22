// 用户领域服务（对应 Java UserDomainServiceImpl 的 createUser / getUserList / getCurrentUser / changePassword；
// getMyContribution 在 contribution.service.ts）。
import { isUniqueViolation } from '../../infra/db.js';
import { ServiceError } from '../../infra/errors.js';
import type { RedisLock } from '../../infra/lock.js';
import { hashPassword, verifyPassword } from '../../infra/password.js';
import type { Operator } from '../common/operator.js';
import { emptyPage, normalizePage, type PageInput, type PageResult } from '../common/pagination.js';
import type { PermissionService } from '../common/permission.js';
import { isBlank, type Maybe } from '../common/strings.js';
import { workspaceRoleName, type WorkspaceRoleName } from '../workspace/enums.js';
import type {
  MembershipRepository,
  MembershipWithWorkspace,
} from '../workspace/membership.repo.js';
import { UserStatus } from './enums.js';
import { UserErrorCode } from './error-codes.js';
import type { UserRepository } from './user.repo.js';

export const USERNAME_MIN_LENGTH = 4;
export const USERNAME_MAX_LENGTH = 10;
export const PASSWORD_MIN_LENGTH = 6;

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

export interface CreateUserInput {
  username?: Maybe<string>;
  displayName?: Maybe<string>;
  password?: Maybe<string>;
  isSystemAdmin?: Maybe<boolean>;
}

export interface UserListInput extends PageInput {
  keyword?: Maybe<string>;
}

export interface UserListItem {
  userId: number;
  username: string;
  displayName: string;
  isSystemAdmin: boolean;
  status: number;
  createTime: number;
}

export interface ChangePasswordInput {
  oldPassword?: Maybe<string>;
  newPassword?: Maybe<string>;
}

export interface UserServiceDeps {
  users: UserRepository;
  memberships: MembershipRepository;
  permissions: PermissionService;
  lock: RedisLock;
}

/** 关系行 → 按空间聚合、角色按 code 升序（selectWithWorkspaceByUserId 已排序）。getCurrentUser 与我的贡献共用。 */
export function groupWorkspaces(memberships: MembershipWithWorkspace[]): CurrentUserWorkspace[] {
  const byWorkspace = new Map<number, CurrentUserWorkspace>();
  for (const m of memberships) {
    let item = byWorkspace.get(m.workspaceId);
    if (!item) {
      item = { workspaceId: m.workspaceId, spaceCode: m.spaceCode, name: m.name, roles: [] };
      byWorkspace.set(m.workspaceId, item);
    }
    item.roles.push(workspaceRoleName(m.roleInSpace));
  }
  return [...byWorkspace.values()];
}

export class UserService {
  constructor(private readonly deps: UserServiceDeps) {}

  /** 用户不存在 → USER_INVALID；禁用 → USER_DISABLED。 */
  async getCurrentUser(userId: number): Promise<CurrentUser> {
    const user = await this.deps.users.selectById(userId);
    if (!user) throw ServiceError.of(UserErrorCode.USER_INVALID);
    if (user.status === UserStatus.DISABLED) throw ServiceError.of(UserErrorCode.USER_DISABLED);
    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      isSystemAdmin: user.isSystemAdmin,
      workspaces: groupWorkspaces(await this.deps.memberships.selectWithWorkspaceByUserId(userId)),
    };
  }

  /** 系统管理员；username 4-10、password ≥ 6、displayName 非空；锁内查重 → USERNAME_EXISTS。 */
  async createUser(operator: Operator, input: CreateUserInput): Promise<{ userId: number }> {
    await this.deps.permissions.checkIsSystemAdmin(operator.userId);
    const { username, password, displayName } = validateCreateParam(input);
    const isSystemAdmin = input.isSystemAdmin === true;

    const userId = await this.deps.lock.withLock(
      `user:username:${username.toLowerCase()}`,
      UserErrorCode.OPERATION_CONFLICT,
      async () => {
        if (await this.deps.users.selectByUsername(username)) {
          throw ServiceError.of(UserErrorCode.USERNAME_EXISTS);
        }
        const now = Date.now();
        try {
          return await this.deps.users.insert({
            username,
            displayName,
            passwordHash: await hashPassword(password),
            isSystemAdmin,
            status: UserStatus.NORMAL,
            creator: operator.username,
            operator: operator.username,
            createTime: now,
            updateTime: now,
          });
        } catch (err) {
          if (isUniqueViolation(err, 'uk_sys_user_username')) {
            throw ServiceError.of(UserErrorCode.USERNAME_EXISTS);
          }
          throw err;
        }
      },
    );
    return { userId };
  }

  /** 系统管理员；keyword 模糊匹配 username / displayName。 */
  async getUserList(operatorId: number, input: UserListInput): Promise<PageResult<UserListItem>> {
    await this.deps.permissions.checkIsSystemAdmin(operatorId);
    const page = normalizePage(input);
    const total = await this.deps.users.countByCondition(input.keyword);
    if (total === 0) return emptyPage(page);
    const rows = await this.deps.users.selectByCondition(input.keyword, page.offset, page.pageSize);
    return {
      list: rows.map((u) => ({
        userId: u.id,
        username: u.username,
        displayName: u.displayName,
        isSystemAdmin: u.isSystemAdmin,
        status: u.status,
        createTime: u.createTime,
      })),
      total,
      pageNum: page.pageNum,
      pageSize: page.pageSize,
    };
  }

  /** 改自己的密码：oldPassword 非空、newPassword ≥ 6；用户不存在 / 禁用 / 原密码错各自报码。 */
  async changePassword(operator: Operator, input: ChangePasswordInput): Promise<void> {
    if (isBlank(input.oldPassword)) {
      throw ServiceError.of(UserErrorCode.INVALID_PARAM, 'oldPassword 不能为空');
    }
    const newPassword = input.newPassword;
    if (typeof newPassword !== 'string' || newPassword.length < PASSWORD_MIN_LENGTH) {
      throw ServiceError.of(UserErrorCode.INVALID_PARAM, 'newPassword 长度需 >= 6 位');
    }
    const user = await this.deps.users.selectById(operator.userId);
    if (!user) throw ServiceError.of(UserErrorCode.USER_INVALID);
    if (user.status === UserStatus.DISABLED) throw ServiceError.of(UserErrorCode.USER_DISABLED);
    if (!(await verifyPassword(input.oldPassword as string, user.passwordHash))) {
      throw ServiceError.of(UserErrorCode.WRONG_PASSWORD);
    }
    await this.deps.users.updatePassword(
      user.id,
      await hashPassword(newPassword),
      operator.username,
      Date.now(),
    );
  }
}

function validateCreateParam(input: CreateUserInput): {
  username: string;
  password: string;
  displayName: string;
} {
  const { username, password, displayName } = input;
  if (
    typeof username !== 'string' ||
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH
  ) {
    throw ServiceError.of(UserErrorCode.INVALID_PARAM, 'username 长度需为 4-10 位');
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw ServiceError.of(UserErrorCode.INVALID_PARAM, 'password 长度需 >= 6 位');
  }
  if (isBlank(displayName)) {
    throw ServiceError.of(UserErrorCode.INVALID_PARAM, 'displayName 不能为空');
  }
  return { username, password, displayName: displayName as string };
}
