/** WorkspaceRoleEnum：LABELER=1, REVIEWER=2, LABEL_ADMIN=3。接口对外返回枚举名字符串。 */
export const WorkspaceRole = { LABELER: 1, REVIEWER: 2, LABEL_ADMIN: 3 } as const;
export type WorkspaceRoleName = keyof typeof WorkspaceRole;
export type WorkspaceRoleCode = (typeof WorkspaceRole)[WorkspaceRoleName];

const NAME_BY_CODE = new Map<number, WorkspaceRoleName>(
  (Object.entries(WorkspaceRole) as [WorkspaceRoleName, number][]).map(([name, code]) => [code, name]),
);

export function isWorkspaceRoleCode(code: unknown): code is WorkspaceRoleCode {
  return typeof code === 'number' && NAME_BY_CODE.has(code);
}

export function workspaceRoleName(code: number): WorkspaceRoleName {
  const name = NAME_BY_CODE.get(code);
  if (!name) throw new Error(`未知的工作空间角色 code: ${code}`);
  return name;
}
