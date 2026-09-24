// 客户端全局态 · 当前工作空间（《菜单栏.md》底部空间切换器、《接口层.md》§五）。
// 当前空间 spaceCode 由侧栏切换器写入；需要 spaceCode 的接口由 http 封装自动带上，页面不重复传。
import { create } from 'zustand';

const SPACE_KEY = 'markflow.spaceCode';

/** 切换器用的空间项（来自 getCurrentUser.workspaces，《接口文档.md》三）。 */
export interface Workspace {
  workspaceId: number;
  spaceCode: string;
  name: string;
}

interface WorkspaceState {
  spaceCode: string | null;
  workspaces: Workspace[];
  setWorkspaces: (list: Workspace[]) => void;
  setSpace: (spaceCode: string) => void;
  clear: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  spaceCode: localStorage.getItem(SPACE_KEY),
  workspaces: [],
  setWorkspaces: (workspaces) => set({ workspaces }),
  setSpace: (spaceCode) => {
    localStorage.setItem(SPACE_KEY, spaceCode);
    set({ spaceCode });
  },
  clear: () => {
    localStorage.removeItem(SPACE_KEY);
    set({ spaceCode: null, workspaces: [] });
  },
}));

/** 非组件环境（如 http 拦截器）取当前空间编码。 */
export const getSpaceCode = () => useWorkspaceStore.getState().spaceCode;
