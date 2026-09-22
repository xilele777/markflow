// 侧栏导航配置（《菜单栏.md》三、《权限可见性.md》二）。
// 分组顺序与归属固定；新增页面先确认归属。每项可加 visible(perms) 控制可见角色。
import type { CurrentRoles } from '@/shared/auth/permissions';

export interface NavItem {
  label: string;
  path: string;
  /** 不传 = 全员可见；传 = 仅返回 true 的角色可见。 */
  visible?: (p: CurrentRoles) => boolean;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

// 可见性谓词（基于权限钩子派生能力）。集中写好命名，菜单 / 路由守卫共用同一份语义。
const onlySA = (p: CurrentRoles) => p.isSA;
const dataAdmin = (p: CurrentRoles) => p.canManageData; // SA + LABEL_ADMIN
const aiViewable = (p: CurrentRoles) => p.canViewAiConfig; // SA + LABEL_ADMIN
const labelToolViewable = (p: CurrentRoles) => p.canViewLabelTool; // 仅 SA

export const NAV: NavGroup[] = [
  {
    group: '资产',
    items: [{ label: '数据集', path: '/dataset', visible: dataAdmin }],
  },
  {
    group: '任务',
    items: [
      { label: '标注任务', path: '/case', visible: dataAdmin },
      // 「我的任务组」全员可见（管理员也可能作为执行人）。
      { label: '我的任务组', path: '/my-groups' },
      // 「我的贡献」全员可见（自查自己；管理员从用户列表跳带 username 参数代查）。
      { label: '我的贡献', path: '/contribution' },
      // 「任务进度」仅 SA（getTaskGroupList 鉴权仅系统管理员）。
      { label: '任务进度', path: '/task-progress', visible: onlySA },
    ],
  },
  {
    group: '系统',
    items: [
      { label: '工作空间', path: '/workspace', visible: onlySA },
      { label: '用户管理', path: '/user', visible: onlySA },
      // 标注管理员对标注工具不可见（按用户确认）。
      { label: '标注工具', path: '/labeltool', visible: labelToolViewable },
      { label: 'AI 配置', path: '/aiconfig', visible: aiViewable },
      // 前端性能（Web Vitals 汇总）：仅 SA。
      { label: '前端性能', path: '/monitoring/web-vitals', visible: onlySA },
    ],
  },
];

/** 按权限过滤菜单，去掉空分组。 */
export function filterNav(perms: CurrentRoles): NavGroup[] {
  return NAV
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.visible || it.visible(perms)) }))
    .filter((g) => g.items.length > 0);
}

/** 按当前 pathname 找到所属分组 + 菜单项（顶栏面包屑 / 侧栏选中态用）。取最长前缀匹配。 */
export function matchNav(pathname: string): { group?: NavGroup; item?: NavItem } {
  let best: { group?: NavGroup; item?: NavItem; len: number } = { len: -1 };
  for (const group of NAV) {
    for (const item of group.items) {
      if (
        (pathname === item.path || pathname.startsWith(item.path + '/')) &&
        item.path.length > best.len
      ) {
        best = { group, item, len: item.path.length };
      }
    }
  }
  return { group: best.group, item: best.item };
}
