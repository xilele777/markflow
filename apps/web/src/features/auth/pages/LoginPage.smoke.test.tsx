import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

vi.mock('@/shared/components/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
  },
  ToastBridge: () => null,
}));

vi.mock('../api', () => ({
  login: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import LoginPage from './LoginPage';
import { login, getCurrentUser } from '../api';
import { toast } from '@/shared/components/Toast';
import { useAuthStore, type CurrentUser } from '@/shared/store/auth';
import { useWorkspaceStore } from '@/shared/store/workspace';
import { ApiError } from '@/types/api';
import { ROLE_LABELER } from '@/shared/auth/permissions';

const loginMock = vi.mocked(login);
const meMock = vi.mocked(getCurrentUser);

function me(partial: Partial<CurrentUser> = {}): CurrentUser {
  return {
    userId: 9,
    username: 'alice',
    displayName: 'Alice',
    isSystemAdmin: false,
    workspaces: [{ workspaceId: 1, spaceCode: 'SPACE_A', name: '空间 A', roles: [ROLE_LABELER] }],
    ...partial,
  };
}

/** 渲染登录页 + 几个落地路由标记，便于断言跳转目标。 */
function renderLogin(initialEntry: string | { pathname: string; state?: unknown } = '/login') {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/dataset', element: <div>PAGE:dataset</div> },
      { path: '/my-groups', element: <div>PAGE:my-groups</div> },
      { path: '/task-progress', element: <div>PAGE:task-progress</div> },
      { path: '/case/:id', element: <div>PAGE:case</div> },
    ],
    { initialEntries: [initialEntry], initialIndex: 0 },
  );
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

async function submit(username = 'alice', password = 'secret') {
  fireEvent.change(screen.getByPlaceholderText('用户名'), { target: { value: username } });
  fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /登\s*录/ }));
}

beforeEach(() => {
  useAuthStore.getState().clear();
  useWorkspaceStore.getState().clear();
});

describe('LoginPage', () => {
  it('渲染品牌区与表单', () => {
    renderLogin();
    expect(screen.getByText('登录工作台')).toBeTruthy();
    expect(screen.getByPlaceholderText('用户名')).toBeTruthy();
    expect(screen.getByPlaceholderText('密码')).toBeTruthy();
    expect(screen.getByRole('button', { name: /登\s*录/ })).toBeTruthy();
  });

  it('空表单提交：不调接口，显示校验文案', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /登\s*录/ }));
    await screen.findByText('请输入用户名');
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('标注员登录成功：写 token / user / 默认空间，toast，跳 /my-groups', async () => {
    loginMock.mockResolvedValue({ token: 'jwt-1' });
    meMock.mockResolvedValue(me());
    renderLogin();
    await submit();

    await screen.findByText('PAGE:my-groups');
    expect(loginMock).toHaveBeenCalledWith({ username: 'alice', password: 'secret' });
    expect(useAuthStore.getState().token).toBe('jwt-1');
    expect(localStorage.getItem('lingshu.token')).toBe('jwt-1');
    expect(useAuthStore.getState().user?.username).toBe('alice');
    expect(useWorkspaceStore.getState().spaceCode).toBe('SPACE_A');
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith('登录成功');
  });

  it('系统管理员登录成功：跳 /dataset', async () => {
    loginMock.mockResolvedValue({ token: 'jwt-2' });
    meMock.mockResolvedValue(me({ isSystemAdmin: true, workspaces: [] }));
    renderLogin();
    await submit('admin', 'pw');
    await screen.findByText('PAGE:dataset');
    // 没有空间时不写 spaceCode。
    expect(useWorkspaceStore.getState().spaceCode).toBeNull();
  });

  it('被 RequireAuth 截到登录页时优先回到 state.from', async () => {
    loginMock.mockResolvedValue({ token: 'jwt-3' });
    meMock.mockResolvedValue(me());
    renderLogin({ pathname: '/login', state: { from: '/case/42' } });
    await submit();
    await screen.findByText('PAGE:case');
  });

  it('state.from 为 /login 时忽略，仍按角色跳转', async () => {
    loginMock.mockResolvedValue({ token: 'jwt-4' });
    meMock.mockResolvedValue(me());
    renderLogin({ pathname: '/login', state: { from: '/login' } });
    await submit();
    await screen.findByText('PAGE:my-groups');
  });

  it('登录接口失败：停留登录页，不写 token，不 toast 成功', async () => {
    loginMock.mockRejectedValue(new ApiError('LOGIN_FAILED', '用户名或密码错误'));
    const router = renderLogin();
    await submit('alice', 'wrong');

    await waitFor(() => expect(loginMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: /登\s*录/ })).toBeTruthy());
    expect(router.state.location.pathname).toBe('/login');
    expect(useAuthStore.getState().token).toBeNull();
    expect(meMock).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('getCurrentUser 失败：清掉已写入的半登录态', async () => {
    loginMock.mockResolvedValue({ token: 'jwt-5' });
    meMock.mockRejectedValue(new ApiError('UNAUTHORIZED', '登录已失效'));
    const router = renderLogin();
    await submit();

    await waitFor(() => expect(meMock).toHaveBeenCalled());
    await waitFor(() => expect(useAuthStore.getState().token).toBeNull());
    expect(localStorage.getItem('lingshu.token')).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
  });
});
