// 角色判定（对应 Java SystemMemberPermissionDomainService）：全部按 DB 实时查，不信任 token 内容。
// 组合规则（"系统管理员 或 …"）在这里给出，避免各服务用 try/catch PERMISSION_DENIED 拼装。
import type { Db } from '../../infra/db.js';
import { ServiceError } from '../../infra/errors.js';
import { UserErrorCode } from '../user/error-codes.js';
import { WorkspaceRole } from '../workspace/enums.js';

export class PermissionService {
  constructor(private readonly db: Db) {}

  async isSystemAdmin(userId: number): Promise<boolean> {
    const row = await this.db
      .selectFrom('sys_user')
      .select('isSystemAdmin')
      .where('id', '=', userId)
      .executeTakeFirst();
    return row?.isSystemAdmin === true;
  }

  async checkIsSystemAdmin(userId: number): Promise<void> {
    if (!(await this.isSystemAdmin(userId))) throw ServiceError.of(UserErrorCode.PERMISSION_DENIED);
  }

  isLabelAdmin(workspaceId: number, userId: number): Promise<boolean> {
    return this.hasRole(userId, WorkspaceRole.LABEL_ADMIN, [workspaceId]);
  }

  async checkIsLabelAdmin(workspaceId: number, userId: number): Promise<void> {
    if (!(await this.isLabelAdmin(workspaceId, userId))) {
      throw ServiceError.of(UserErrorCode.PERMISSION_DENIED);
    }
  }

  isLabelAdminOfAnyWorkspace(userId: number): Promise<boolean> {
    return this.hasRole(userId, WorkspaceRole.LABEL_ADMIN, null);
  }

  async checkIsLabelAdminOfAnyWorkspace(userId: number): Promise<void> {
    if (!(await this.isLabelAdminOfAnyWorkspace(userId))) {
      throw ServiceError.of(UserErrorCode.PERMISSION_DENIED);
    }
  }

  /** 是否为给定空间集合中任一空间的 LABEL_ADMIN；空集直接 false。 */
  isLabelAdminOfAnyOf(userId: number, workspaceIds: readonly number[]): Promise<boolean> {
    if (workspaceIds.length === 0) return Promise.resolve(false);
    return this.hasRole(userId, WorkspaceRole.LABEL_ADMIN, workspaceIds);
  }

  /** 系统管理员 或 该空间 LABEL_ADMIN（空间成员管理、空间内资产）。 */
  async checkCanManageWorkspace(workspaceId: number, userId: number): Promise<void> {
    if (await this.isSystemAdmin(userId)) return;
    await this.checkIsLabelAdmin(workspaceId, userId);
  }

  /** 系统管理员 或 任意空间 LABEL_ADMIN（全局资产：标注工具、AI 配置）。 */
  async checkCanViewGlobalAssets(userId: number): Promise<void> {
    if (await this.isSystemAdmin(userId)) return;
    await this.checkIsLabelAdminOfAnyWorkspace(userId);
  }

  private async hasRole(
    userId: number,
    role: number,
    workspaceIds: readonly number[] | null,
  ): Promise<boolean> {
    let query = this.db
      .selectFrom('user_workspace_ship')
      .select('id')
      .where('userId', '=', userId)
      .where('roleInSpace', '=', role);
    if (workspaceIds !== null) query = query.where('workspaceId', 'in', [...workspaceIds]);
    return (await query.limit(1).executeTakeFirst()) !== undefined;
  }
}
