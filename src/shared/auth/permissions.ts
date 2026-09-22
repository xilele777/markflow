// 权限可见性钩子（《权限可见性.md》落地）。
// 数据来源：useAuthStore.user.isSystemAdmin + useAuthStore.user.workspaces[].roles（字符串名数组）
// 与 useWorkspaceStore.spaceCode 一起算出「当前空间的角色集合」。
//
// 一期粒度：四角色 SA / LABEL_ADMIN / REVIEWER / ANNOTATOR，菜单 + 路由 + 按钮全按 useCurrentRoles 返回值条件渲染。
// 用法（组件内）：
//   const perms = useCurrentRoles();
//   if (!perms.canManageData) return null;
import { useAuthStore, type CurrentUser } from '@/shared/store/auth';
import { useWorkspaceStore } from '@/shared/store/workspace';

// 角色 code 常量（与后端 getCurrentUser.workspaces[].roles 字符串严格一致）。
// 后端实际返回英文 code（不是规范文档里的中文名），与 RoleCode 1/2/3 的中文映射不同：
//   LABELER = 标注员（auth.RoleCode=1）
//   REVIEWER = 审核员（auth.RoleCode=2）
//   LABEL_ADMIN = 标注管理员（auth.RoleCode=3）
export const ROLE_LABEL_ADMIN = 'LABEL_ADMIN';
export const ROLE_REVIEWER = 'REVIEWER';
export const ROLE_LABELER = 'LABELER';

export interface CurrentRoles {
  /** 系统管理员（跨空间）。 */
  isSA: boolean;
  /** 当前空间标注管理员。 */
  isLabelAdmin: boolean;
  /** 当前空间审核员。 */
  isReviewer: boolean;
  /** 当前空间标注员。 */
  isAnnotator: boolean;

  // —— 派生能力（按《权限可见性.md》二、三）——

  /** 能管理「数据」类资源（数据集 / case / 结果导出）。 */
  canManageData: boolean;
  /** 能管理「系统」类资源（工作空间 / 用户 / 标注工具 / 创建写型 AI 配置）。 */
  canManageSystem: boolean;
  /** 看「任务进度」菜单（getTaskGroupList 仅 SA）。 */
  canViewTaskProgress: boolean;
  /** 看「AI 配置」菜单（仅 SA；LABEL_ADMIN 不可见，按用户确认）。 */
  canViewAiConfig: boolean;
  /** 看「标注工具」菜单（仅 SA；LABEL_ADMIN 不可见，按用户确认）。 */
  canViewLabelTool: boolean;
  /** 写「AI 配置」（创建 / 编辑）。 */
  canWriteAiConfig: boolean;
  /** 触发结果导出（仅 SA 或当前空间 LABEL_ADMIN；接口侧鉴权一致）。 */
  canExportResult: boolean;
}

const EMPTY: CurrentRoles = {
  isSA: false,
  isLabelAdmin: false,
  isReviewer: false,
  isAnnotator: false,
  canManageData: false,
  canManageSystem: false,
  canViewTaskProgress: false,
  canViewAiConfig: false,
  canViewLabelTool: false,
  canWriteAiConfig: false,
  canExportResult: false,
};

/** 纯函数：由用户与当前空间算出角色 + 派生能力。
 *  规则：
 *   - 用户为空（未登录） → 全 false
 *   - 找不到当前空间 / 未选空间 → 仅 isSA 可能为 true，空间角色全 false
 *  组件内用 useCurrentRoles；非渲染上下文（如登录成功回调）直接调用本函数。
 */
export function computeRoles(user: CurrentUser | null, spaceCode: string | null): CurrentRoles {
  if (!user) return EMPTY;

  const isSA = user.isSystemAdmin;
  const ws = spaceCode ? user.workspaces.find((w) => w.spaceCode === spaceCode) : undefined;
  const roles = ws?.roles ?? [];
  const isLabelAdmin = roles.includes(ROLE_LABEL_ADMIN);
  const isReviewer = roles.includes(ROLE_REVIEWER);
  const isAnnotator = roles.includes(ROLE_LABELER);

  // 派生能力规则——保持跟规范表一致，方便后续微调集中改这里。
  const canManageData = isSA || isLabelAdmin;
  const canManageSystem = isSA;
  const canViewTaskProgress = isSA;
  const canViewAiConfig = isSA;
  const canViewLabelTool = isSA;
  const canWriteAiConfig = isSA;
  const canExportResult = isSA || isLabelAdmin;

  return {
    isSA,
    isLabelAdmin,
    isReviewer,
    isAnnotator,
    canManageData,
    canManageSystem,
    canViewTaskProgress,
    canViewAiConfig,
    canViewLabelTool,
    canWriteAiConfig,
    canExportResult,
  };
}

/** 计算当前用户在当前空间的角色 + 派生能力（订阅 store，随登录 / 切空间刷新）。 */
export function useCurrentRoles(): CurrentRoles {
  const user = useAuthStore((s) => s.user);
  const spaceCode = useWorkspaceStore((s) => s.spaceCode);
  return computeRoles(user, spaceCode);
}

/** 给路由首选/重定向用：按当前用户角色挑一个有权访问的入口路径。
 *  优先级：数据集 > 任务进度 > 我的任务组 > 登录。
 */
export function pickHomePath(perms: CurrentRoles): string {
  if (perms.canManageData) return '/dataset';
  if (perms.canViewTaskProgress) return '/task-progress';
  // 标注员 / 审核员：进我的任务组。
  if (perms.isReviewer || perms.isAnnotator) return '/my-groups';
  // 没角色 → 也给 my-groups（页面会显示空态），避免 / 死循环。
  return '/my-groups';
}
