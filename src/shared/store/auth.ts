// 客户端全局态 · 鉴权（《接口层.md》§五、《工程结构.md》）。
// 只放轻量态：token + 当前用户 + 角色。token 同步落 localStorage，刷新后仍在。
import { create } from 'zustand';

const TOKEN_KEY = 'lingshu.token';

/** 空间角色 code（成员分配等入参用）：1=标注员 2=审核员 3=标注管理员。 */
export type RoleCode = 1 | 2 | 3;

/** getCurrentUser.workspaces[]（《接口文档.md》三）。roles 为后端英文角色 code 列表。 */
export interface UserWorkspace {
  workspaceId: number;
  spaceCode: string;
  name: string;
  /** 角色 code：'LABELER' / 'REVIEWER' / 'LABEL_ADMIN'（与 shared/auth/permissions 常量一致）。 */
  roles: string[];
}

/** getCurrentUser 出参（《接口文档.md》三）。 */
export interface CurrentUser {
  userId: number;
  username: string;
  displayName: string;
  isSystemAdmin: boolean;
  workspaces: UserWorkspace[];
}

interface AuthState {
  token: string | null;
  user: CurrentUser | null;
  setToken: (token: string) => void;
  setUser: (user: CurrentUser) => void;
  /** 退出 / 鉴权失效：清 token + 用户。 */
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
  setToken: (token) => {
    localStorage.setItem(TOKEN_KEY, token);
    set({ token });
  },
  setUser: (user) => set({ user }),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, user: null });
  },
}));

/** 非组件环境（如 http 拦截器）取 token。 */
export const getToken = () => useAuthStore.getState().token;
