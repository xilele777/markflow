import { describe, expect, it } from 'vitest';
import { filterNav, matchNav, NAV } from './nav';
import { computeRoles, ROLE_LABEL_ADMIN, ROLE_LABELER } from '@/shared/auth/permissions';
import type { CurrentUser } from '@/shared/store/auth';

function user(partial: Partial<CurrentUser> = {}): CurrentUser {
  return {
    userId: 1,
    username: 'u',
    displayName: 'U',
    isSystemAdmin: false,
    workspaces: [],
    ...partial,
  };
}

const labels = (groups: ReturnType<typeof filterNav>) =>
  groups.map((g) => [g.group, g.items.map((i) => i.label)] as const);

describe('filterNav', () => {
  it('系统管理员看到全部菜单', () => {
    const all = filterNav(computeRoles(user({ isSystemAdmin: true }), null));
    expect(labels(all)).toEqual([
      ['资产', ['数据集']],
      ['任务', ['标注任务', '我的任务组', '我的贡献', '任务进度']],
      ['系统', ['工作空间', '用户管理', '标注工具', 'AI 配置', '前端性能']],
    ]);
  });

  it('标注管理员：有资产与标注任务，无任务进度，整个「系统」分组被去掉', () => {
    const perms = computeRoles(
      user({
        workspaces: [{ workspaceId: 1, spaceCode: 'A', name: 'A', roles: [ROLE_LABEL_ADMIN] }],
      }),
      'A',
    );
    expect(labels(filterNav(perms))).toEqual([
      ['资产', ['数据集']],
      ['任务', ['标注任务', '我的任务组', '我的贡献']],
    ]);
  });

  it('标注员：只剩「任务」分组的全员项', () => {
    const perms = computeRoles(
      user({ workspaces: [{ workspaceId: 1, spaceCode: 'A', name: 'A', roles: [ROLE_LABELER] }] }),
      'A',
    );
    expect(labels(filterNav(perms))).toEqual([['任务', ['我的任务组', '我的贡献']]]);
  });

  it('未登录：仍保留全员可见项，不抛错', () => {
    expect(labels(filterNav(computeRoles(null, null)))).toEqual([
      ['任务', ['我的任务组', '我的贡献']],
    ]);
  });

  it('不修改 NAV 常量本身', () => {
    const before = JSON.stringify(NAV.map((g) => g.items.map((i) => i.path)));
    filterNav(computeRoles(null, null));
    expect(JSON.stringify(NAV.map((g) => g.items.map((i) => i.path)))).toBe(before);
  });
});

describe('matchNav', () => {
  it('精确路径命中', () => {
    const m = matchNav('/dataset');
    expect(m.group?.group).toBe('资产');
    expect(m.item?.label).toBe('数据集');
  });

  it('子路径按前缀命中父菜单', () => {
    expect(matchNav('/dataset/12').item?.label).toBe('数据集');
    expect(matchNav('/my-groups/7').item?.label).toBe('我的任务组');
    expect(matchNav('/case/3/detail').item?.label).toBe('标注任务');
  });

  it('前缀相似但非子路径不命中（/my-groups 不匹配 /my-groupsx）', () => {
    expect(matchNav('/my-groupsx').item).toBeUndefined();
  });

  it('未知路径返回空', () => {
    const m = matchNav('/nowhere');
    expect(m.group).toBeUndefined();
    expect(m.item).toBeUndefined();
  });

  it('执行页等壳外路径不属于任何菜单', () => {
    expect(matchNav('/exec/label/1').item).toBeUndefined();
    expect(matchNav('/login').item).toBeUndefined();
  });
});
