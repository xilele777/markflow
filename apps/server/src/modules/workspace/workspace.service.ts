// 工作空间领域服务（对应 Java WorkspaceDomainServiceImpl；规则见后端索引 §3.3 / §2.9）。
import { isUniqueViolation } from '../../infra/db.js';
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import type { RedisLock } from '../../infra/lock.js';
import type { Operator } from '../common/operator.js';
import { emptyPage, normalizePage, type PageInput, type PageResult } from '../common/pagination.js';
import type { PermissionService } from '../common/permission.js';
import type { Maybe } from '../common/strings.js';
import { UserStatus } from '../user/enums.js';
import { UserErrorCode } from '../user/error-codes.js';
import type { UserRepository } from '../user/user.repo.js';
import { isWorkspaceRoleCode, type WorkspaceRoleCode } from './enums.js';
import { WorkspaceErrorCode } from './error-codes.js';
import type { MembershipRepository } from './membership.repo.js';
import type { WorkspaceRepository, WorkspaceScope } from './workspace.repo.js';

/** spaceCode：4-32 位 [a-z0-9_-]。 */
const SPACE_CODE_PATTERN = /^[a-z0-9_-]{4,32}$/;
const NAME_MIN_LENGTH = 4;
const NAME_MAX_LENGTH = 32;

export interface CreateWorkspaceInput {
  spaceCode?: Maybe<string>;
  name?: Maybe<string>;
  description?: Maybe<string>;
}

export interface WorkspaceListInput extends PageInput {
  keyword?: Maybe<string>;
}

export interface WorkspaceListItem {
  workspaceId: number;
  spaceCode: string;
  name: string;
  description: string | null;
  createTime: number;
}

export interface AddMemberInput {
  workspaceId?: Maybe<number>;
  members?: Maybe<Array<{ userId?: Maybe<number>; roles?: Maybe<Array<Maybe<number>>> }>>;
}

export interface AddMemberFailure {
  userId: number | null;
  username: string | null;
  /** 失败原因：错误码字符串（USER_INVALID / USER_DISABLED / OPERATION_CONFLICT），与 Java 一致。 */
  reason: string;
}

export interface AddMemberResult {
  successCount: number;
  failures: AddMemberFailure[];
}

export interface WorkspaceMember {
  userId: number;
  username: string;
  displayName: string;
  status: number;
  /** 角色 code（1/2/3）升序。 */
  roles: number[];
}

export interface WorkspaceDetail {
  workspaceId: number;
  spaceCode: string;
  name: string;
  description: string | null;
  createTime: number;
  members: WorkspaceMember[];
}

export interface WorkspaceServiceDeps {
  workspaces: WorkspaceRepository;
  memberships: MembershipRepository;
  users: UserRepository;
  permissions: PermissionService;
  lock: RedisLock;
}

interface NormalizedMember {
  userId: number | null;
  roles: WorkspaceRoleCode[];
}

export class WorkspaceService {
  constructor(private readonly deps: WorkspaceServiceDeps) {}

  /** 系统管理员；spaceCode 正则、name 4-32；锁内查重 → SPACE_CODE_EXISTS。 */
  async createWorkspace(
    operator: Operator,
    input: CreateWorkspaceInput,
  ): Promise<{ workspaceId: number }> {
    await this.deps.permissions.checkIsSystemAdmin(operator.userId);
    const { spaceCode, name } = input;
    if (typeof spaceCode !== 'string' || !SPACE_CODE_PATTERN.test(spaceCode)) {
      throw ServiceError.of(WorkspaceErrorCode.SPACE_CODE_INVALID);
    }
    if (
      typeof name !== 'string' ||
      name.length < NAME_MIN_LENGTH ||
      name.length > NAME_MAX_LENGTH
    ) {
      throw ServiceError.of(WorkspaceErrorCode.NAME_INVALID);
    }

    const workspaceId = await this.deps.lock.withLock(
      `workspace:spaceCode:${spaceCode}`,
      WorkspaceErrorCode.OPERATION_CONFLICT,
      async () => {
        if (await this.deps.workspaces.selectBySpaceCode(spaceCode)) {
          throw ServiceError.of(WorkspaceErrorCode.SPACE_CODE_EXISTS);
        }
        const now = Date.now();
        try {
          return await this.deps.workspaces.insert({
            spaceCode,
            name,
            description: input.description ?? null,
            creator: operator.username,
            operator: operator.username,
            createTime: now,
            updateTime: now,
          });
        } catch (err) {
          if (isUniqueViolation(err, 'uk_workspace_space_code')) {
            throw ServiceError.of(WorkspaceErrorCode.SPACE_CODE_EXISTS);
          }
          throw err;
        }
      },
    );
    return { workspaceId };
  }

  /** 登录即可：系统管理员看全部；其他人只看自己所属空间（无所属 → 空页）。 */
  async getWorkspaceList(
    userId: number,
    input: WorkspaceListInput,
  ): Promise<PageResult<WorkspaceListItem>> {
    const page = normalizePage(input);
    const scope = await this.resolveScope(userId);
    if (scope !== null && scope.length === 0) return emptyPage(page);

    const total = await this.deps.workspaces.countByCondition(scope, input.keyword);
    if (total === 0) return emptyPage(page);
    const rows = await this.deps.workspaces.selectByCondition(
      scope,
      input.keyword,
      page.offset,
      page.pageSize,
    );
    return {
      list: rows.map((w) => ({
        workspaceId: w.id,
        spaceCode: w.spaceCode,
        name: w.name,
        description: w.description,
        createTime: w.createTime,
      })),
      total,
      pageNum: page.pageNum,
      pageSize: page.pageSize,
    };
  }

  /**
   * 系统管理员 或 该空间 LABEL_ADMIN。逐成员处理、局部成功：
   * 用户不存在 / 禁用 / 抢锁失败 记入 failures；已存在的 (user, role) 幂等跳过不计数。
   */
  async addWorkspaceMember(operator: Operator, input: AddMemberInput): Promise<AddMemberResult> {
    // 边界校验（对应 Java Controller）：role code 不合法直接 PARAM_INVALID
    const members = normalizeMembers(input.members);
    const workspaceId = requireWorkspaceId(input.workspaceId);
    await this.deps.permissions.checkCanManageWorkspace(workspaceId, operator.userId);
    if (!(await this.deps.workspaces.selectById(workspaceId))) {
      throw ServiceError.of(WorkspaceErrorCode.WORKSPACE_NOT_FOUND);
    }

    let successCount = 0;
    const failures: AddMemberFailure[] = [];
    for (const member of members) {
      successCount += await this.handleMember(operator, workspaceId, member, failures);
    }
    return { successCount, failures };
  }

  /** 查看权限沿用「可管理成员」：系统管理员 或 该空间 LABEL_ADMIN。 */
  async getWorkspaceDetail(
    operatorId: number,
    input: { workspaceId?: Maybe<number> },
  ): Promise<WorkspaceDetail> {
    const workspaceId = requireWorkspaceId(input.workspaceId);
    await this.deps.permissions.checkCanManageWorkspace(workspaceId, operatorId);
    const workspace = await this.deps.workspaces.selectById(workspaceId);
    if (!workspace) throw ServiceError.of(WorkspaceErrorCode.WORKSPACE_NOT_FOUND);
    return {
      workspaceId: workspace.id,
      spaceCode: workspace.spaceCode,
      name: workspace.name,
      description: workspace.description,
      createTime: workspace.createTime,
      members: await this.buildMembers(workspaceId),
    };
  }

  private async resolveScope(userId: number): Promise<WorkspaceScope> {
    if (await this.deps.permissions.isSystemAdmin(userId)) return null;
    const ships = await this.deps.memberships.selectByUserId(userId);
    return [...new Set(ships.map((s) => s.workspaceId))];
  }

  /** 返回该成员成功写入的 (user, role) 条数；用户级失败追加到 failures。 */
  private async handleMember(
    operator: Operator,
    workspaceId: number,
    member: NormalizedMember,
    failures: AddMemberFailure[],
  ): Promise<number> {
    const user =
      member.userId === null ? undefined : await this.deps.users.selectById(member.userId);
    if (!user) {
      failures.push({
        userId: member.userId,
        username: null,
        reason: UserErrorCode.USER_INVALID.code,
      });
      return 0;
    }
    if (user.status === UserStatus.DISABLED) {
      failures.push({
        userId: user.id,
        username: user.username,
        reason: UserErrorCode.USER_DISABLED.code,
      });
      return 0;
    }

    const lockName = `workspace:member:user:${user.username.toLowerCase()}`;
    const token = await this.deps.lock.tryLock(lockName);
    if (token === null) {
      failures.push({
        userId: user.id,
        username: user.username,
        reason: WorkspaceErrorCode.OPERATION_CONFLICT.code,
      });
      return 0;
    }
    try {
      let inserted = 0;
      for (const role of member.roles) {
        const ok = await this.deps.memberships.insertIfAbsent({
          workspaceId,
          userId: user.id,
          roleInSpace: role,
          creator: operator.username,
          createTime: Date.now(),
        });
        if (ok) inserted += 1;
      }
      return inserted;
    } finally {
      await this.deps.lock.unlock(lockName, token);
    }
  }

  /** 按最早加入顺序列出成员，同一用户多角色合并、roles 按 code 升序；指向不存在用户的脏关系跳过。 */
  private async buildMembers(workspaceId: number): Promise<WorkspaceMember[]> {
    const ships = await this.deps.memberships.selectByWorkspaceId(workspaceId);
    if (ships.length === 0) return [];
    const rolesByUser = new Map<number, number[]>();
    for (const ship of ships) {
      const roles = rolesByUser.get(ship.userId) ?? [];
      roles.push(ship.roleInSpace);
      rolesByUser.set(ship.userId, roles);
    }
    const users = await this.deps.users.selectByIds([...rolesByUser.keys()]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const members: WorkspaceMember[] = [];
    for (const [userId, roles] of rolesByUser) {
      const user = userById.get(userId);
      if (!user) continue;
      members.push({
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        status: user.status,
        roles: [...roles].sort((a, b) => a - b),
      });
    }
    return members;
  }
}

function requireWorkspaceId(workspaceId: Maybe<number>): number {
  if (typeof workspaceId !== 'number') {
    throw ServiceError.of(CommonErrorCode.PARAM_INVALID, 'workspaceId 不能为空');
  }
  return workspaceId;
}

function normalizeMembers(members: AddMemberInput['members']): NormalizedMember[] {
  if (!members) return [];
  return members.map((m) => {
    const roles: WorkspaceRoleCode[] = [];
    for (const code of m.roles ?? []) {
      if (!isWorkspaceRoleCode(code)) {
        throw ServiceError.of(CommonErrorCode.PARAM_INVALID, `role 不合法: ${String(code)}`);
      }
      if (!roles.includes(code)) roles.push(code);
    }
    return { userId: typeof m.userId === 'number' ? m.userId : null, roles };
  });
}
