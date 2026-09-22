// 重新拉取当前用户，刷新 user + 可切换空间列表。
// 左下角空间切换器的列表来自 getCurrentUser.workspaces（登录时的快照），不是实时搜索后端；
// 创建空间 / 加入成员后调用本函数，让切换器无需重新登录即可刷新。
import { getCurrentUser } from './api';
import { useAuthStore } from '@/shared/store/auth';
import { useWorkspaceStore } from '@/shared/store/workspace';

export async function refreshCurrentUser() {
  const me = await getCurrentUser();
  useAuthStore.getState().setUser(me);
  useWorkspaceStore.getState().setWorkspaces(me.workspaces);
  return me;
}
