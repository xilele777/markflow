import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';

vi.mock('@/shared/components/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
  },
}));

import http, { get, post, postPage, postScoped } from './http';
import { ApiError } from '@/types/api';
import { toast } from '@/shared/components/Toast';
import { useAuthStore } from '@/shared/store/auth';
import { useWorkspaceStore } from '@/shared/store/workspace';

type Captured = { url?: string; method?: string; body?: unknown; headers: Record<string, unknown> };

/** 用自定义 adapter 替代网络：按 status 决定 resolve / reject，并记录最后一次请求。 */
function install(status: number, body: unknown) {
  const captured: Captured = { headers: {} };
  const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
    captured.url = config.url;
    captured.method = config.method;
    captured.body = config.data ? JSON.parse(config.data as string) : undefined;
    captured.headers = { ...(config.headers as unknown as Record<string, unknown>) };
    const response = { data: body, status, statusText: String(status), headers: {}, config };
    if (status >= 200 && status < 300) return Promise.resolve(response);
    return Promise.reject(
      new AxiosError(
        `Request failed with status code ${status}`,
        'ERR_BAD_RESPONSE',
        config,
        null,
        response,
      ),
    );
  };
  http.defaults.adapter = adapter;
  return captured;
}

const ok = <T>(data: T, extra: object = {}) => ({
  success: true,
  code: 'SUCCESS',
  message: 'ok',
  data,
  timestamp: 1,
  ...extra,
});

const originalAdapter = http.defaults.adapter;

beforeEach(() => {
  useAuthStore.getState().clear();
  useWorkspaceStore.getState().clear();
});

afterEach(() => {
  http.defaults.adapter = originalAdapter;
});

describe('请求拦截', () => {
  it('有 token 时注入 Bearer；无 token 不带 Authorization', async () => {
    const c1 = install(200, ok({}));
    await post('/x');
    expect(c1.headers.Authorization).toBeUndefined();

    useAuthStore.getState().setToken('t0k');
    const c2 = install(200, ok({}));
    await post('/x');
    expect(c2.headers.Authorization).toBe('Bearer t0k');
  });

  it('postScoped 自动带上当前 spaceCode，且调用方字段优先', async () => {
    useWorkspaceStore.getState().setSpace('SP1');
    const c = install(200, ok(null));
    await postScoped('/dataset/list', { name: 'n' });
    expect(c.body).toEqual({ spaceCode: 'SP1', name: 'n' });
    expect(c.method).toBe('post');
    expect(c.url).toBe('/dataset/list');
  });
});

describe('响应拆包络', () => {
  it('success=true：post / get 直接返回 data', async () => {
    install(200, ok({ id: 7 }));
    expect(await post<{ id: number }>('/a')).toEqual({ id: 7 });
    expect(await get<{ id: number }>('/a')).toEqual({ id: 7 });
  });

  it('非标准包络原样放行（返回 body.data，即 undefined）', async () => {
    install(200, { hello: 'world' });
    expect(await post('/raw')).toBeUndefined();
  });

  it('success=false：toast 业务文案并抛 ApiError(code, message)', async () => {
    install(200, {
      success: false,
      code: 'CASE_NOT_FOUND',
      message: '任务不存在',
      data: null,
      timestamp: 1,
    });
    const err = (await post('/case/detail').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('CASE_NOT_FOUND');
    expect(err.message).toBe('任务不存在');
    expect(toast.error).toHaveBeenCalledWith('任务不存在');
  });

  it('success=false 且无 message：用默认文案「请求失败」', async () => {
    install(200, { success: false, code: 'X', message: '', data: null, timestamp: 1 });
    const err = (await post('/x').catch((e) => e)) as ApiError;
    expect(err.message).toBe('请求失败');
    expect(toast.error).toHaveBeenCalledWith('请求失败');
  });

  it('postPage：返回 { list, total, pageNum, pageSize }，缺字段有兜底', async () => {
    install(200, ok([{ a: 1 }, { a: 2 }], { total: 20, pageNum: 2, pageSize: 10 }));
    expect(await postPage('/list')).toEqual({
      list: [{ a: 1 }, { a: 2 }],
      total: 20,
      pageNum: 2,
      pageSize: 10,
    });

    install(200, ok(null));
    expect(await postPage('/list')).toEqual({ list: [], total: 0, pageNum: 1, pageSize: 0 });
  });
});

describe('HTTP 错误', () => {
  it('401：清 auth / workspace store，跳 /login，抛 ApiError(UNAUTHORIZED)', async () => {
    useAuthStore.getState().setToken('t0k');
    useWorkspaceStore.getState().setSpace('SP1');
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    install(401, {
      success: false,
      code: 'UNAUTHORIZED',
      message: '未登录',
      data: null,
      timestamp: 1,
    });

    const err = (await post('/user/getCurrentUser').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(useAuthStore.getState().token).toBeNull();
    expect(localStorage.getItem('lingshu.token')).toBeNull();
    expect(useWorkspaceStore.getState().spaceCode).toBeNull();
    expect(assign).toHaveBeenCalledWith('/login');
    // 401 不弹 toast（登录页会自己提示）。
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('403 / 5xx：toast 后端 message 并原样抛 AxiosError', async () => {
    install(403, {
      success: false,
      code: 'FORBIDDEN',
      message: '无权限',
      data: null,
      timestamp: 1,
    });
    const err = (await post('/x').catch((e) => e)) as Error;
    expect(err).toBeInstanceOf(AxiosError);
    expect(toast.error).toHaveBeenCalledWith('无权限');
  });

  it('无响应体（网络异常）：toast 默认文案', async () => {
    install(502, undefined);
    await post('/x').catch(() => {});
    expect(toast.error).toHaveBeenCalledWith('网络异常，请稍后重试');
  });
});
