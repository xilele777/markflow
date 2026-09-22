import { describe, expect, it } from 'vitest';
import {
  computeRoles,
  pickHomePath,
  ROLE_LABEL_ADMIN,
  ROLE_LABELER,
  ROLE_REVIEWER,
} from './permissions';
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

function ws(spaceCode: string, roles: string[]) {
  return { workspaceId: 1, spaceCode, name: spaceCode, roles };
}

describe('computeRoles', () => {
  it('未登录：全部 false', () => {
    const r = computeRoles(null, 'A');
    expect(Object.values(r).every((v) => v === false)).toBe(true);
  });

  it('系统管理员：与空间无关，所有管理能力为 true，但空间角色为 false', () => {
    const r = computeRoles(user({ isSystemAdmin: true }), null);
    expect(r.isSA).toBe(true);
    expect(r.isLabelAdmin).toBe(false);
    expect(r.isReviewer).toBe(false);
    expect(r.isAnnotator).toBe(false);
    expect(r.canManageData).toBe(true);
    expect(r.canManageSystem).toBe(true);
    expect(r.canViewTaskProgress).toBe(true);
    expect(r.canViewAiConfig).toBe(true);
    expect(r.canViewLabelTool).toBe(true);
    expect(r.canWriteAiConfig).toBe(true);
    expect(r.canExportResult).toBe(true);
  });

  it('空间标注管理员：能管数据与导出，不能管系统 / 看 AI 配置 / 看标注工具 / 看任务进度', () => {
    const r = computeRoles(user({ workspaces: [ws('A', [ROLE_LABEL_ADMIN])] }), 'A');
    expect(r.isLabelAdmin).toBe(true);
    expect(r.canManageData).toBe(true);
    expect(r.canExportResult).toBe(true);
    expect(r.canManageSystem).toBe(false);
    expect(r.canViewAiConfig).toBe(false);
    expect(r.canViewLabelTool).toBe(false);
    expect(r.canViewTaskProgress).toBe(false);
    expect(r.canWriteAiConfig).toBe(false);
  });

  it('标注员 + 审核员双角色：两个空间角色都为 true，无管理能力', () => {
    const r = computeRoles(user({ workspaces: [ws('A', [ROLE_LABELER, ROLE_REVIEWER])] }), 'A');
    expect(r.isAnnotator).toBe(true);
    expect(r.isReviewer).toBe(true);
    expect(r.canManageData).toBe(false);
    expect(r.canExportResult).toBe(false);
  });

  it('角色按当前空间取：切到没有角色的空间后空间角色全 false', () => {
    const u = user({ workspaces: [ws('A', [ROLE_LABEL_ADMIN]), ws('B', [ROLE_LABELER])] });
    expect(computeRoles(u, 'A').isLabelAdmin).toBe(true);
    expect(computeRoles(u, 'B').isLabelAdmin).toBe(false);
    expect(computeRoles(u, 'B').isAnnotator).toBe(true);
    expect(computeRoles(u, 'C').isAnnotator).toBe(false);
    expect(computeRoles(u, null).isAnnotator).toBe(false);
  });

  it('未知角色字符串被忽略', () => {
    const r = computeRoles(user({ workspaces: [ws('A', ['OWNER', 'labeler'])] }), 'A');
    expect(r.isAnnotator).toBe(false);
    expect(r.isLabelAdmin).toBe(false);
  });
});

describe('pickHomePath', () => {
  it('能管数据 → /dataset', () => {
    expect(pickHomePath(computeRoles(user({ isSystemAdmin: true }), null))).toBe('/dataset');
    expect(
      pickHomePath(computeRoles(user({ workspaces: [ws('A', [ROLE_LABEL_ADMIN])] }), 'A')),
    ).toBe('/dataset');
  });

  it('标注员 / 审核员 → /my-groups', () => {
    expect(pickHomePath(computeRoles(user({ workspaces: [ws('A', [ROLE_LABELER])] }), 'A'))).toBe(
      '/my-groups',
    );
    expect(pickHomePath(computeRoles(user({ workspaces: [ws('A', [ROLE_REVIEWER])] }), 'A'))).toBe(
      '/my-groups',
    );
  });

  it('无任何角色 → 也回 /my-groups（避免 / 死循环）', () => {
    expect(pickHomePath(computeRoles(user(), 'A'))).toBe('/my-groups');
    expect(pickHomePath(computeRoles(null, null))).toBe('/my-groups');
  });

  it('仅有任务进度权限（人为构造）→ /task-progress', () => {
    const perms = { ...computeRoles(null, null), canViewTaskProgress: true };
    expect(pickHomePath(perms)).toBe('/task-progress');
  });
});
