// 侧栏导航配置（《菜单栏.md》三）。分组顺序与归属即此表，新增页面先确认归属，不随意调整。
// 权限显隐：本期「先不过滤，全显」；store 已存 isSystemAdmin + roles，过滤逻辑待后端鉴权确认后再补。
// TODO(权限): 按《权限可见性.md》建议表实现菜单过滤 + 路由守卫。

export interface NavItem {
  label: string;
  path: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { group: '资产', items: [{ label: '数据集', path: '/dataset' }] },
  {
    group: '任务',
    items: [
      { label: '标注任务', path: '/case' },
      { label: '我的任务组', path: '/my-groups' },
      // 任务进度：getTaskGroupList（仅系统管理员）；菜单先全员可见，进入后按角色降级为空态。
      { label: '任务进度', path: '/task-progress' },
    ],
  },
  {
    group: '系统',
    items: [
      { label: '工作空间', path: '/workspace' },
      { label: '用户管理', path: '/user' },
      { label: '标注工具', path: '/labeltool' },
      { label: 'AI 配置', path: '/aiconfig' },
    ],
  },
];

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
