// HTTP 客户端（axios 单例）—— 《接口层.md》。
// 约定：baseURL=/api、一律 POST application/json；请求注入 Bearer；响应拆包络；401 跳登录。
// 安全：任何日志/输出都不得打印 token / apiKey / password。
import axios, { type AxiosError, type AxiosResponse } from 'axios';
import { ApiError, type ApiResponse, type PageResult } from '@/types/api';
import { getToken, useAuthStore } from '@/shared/store/auth';
import { getSpaceCode, useWorkspaceStore } from '@/shared/store/workspace';
import { toast } from '@/shared/components/Toast';

const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截：注入 Authorization: Bearer <token>。
http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 鉴权失效：清 token + 空间，跳登录。用 location 跳转避免与 router 耦合。
function onUnauthorized() {
  useAuthStore.getState().clear();
  useWorkspaceStore.getState().clear();
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

// 响应拦截：拆包络。
http.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const body = response.data;
    // 非标准包络（极少数）直接放行 data。
    if (body == null || typeof body !== 'object' || !('success' in body)) {
      return response;
    }
    if (body.success) {
      return response;
    }
    // 业务失败：全局 Toast + 抛业务错误，调用方可按需再处理。
    toast.error(body.message || '请求失败');
    return Promise.reject(new ApiError(body.code, body.message || '请求失败'));
  },
  (error: AxiosError<ApiResponse>) => {
    const status = error.response?.status;
    if (status === 401) {
      onUnauthorized();
      return Promise.reject(new ApiError('UNAUTHORIZED', '登录已失效，请重新登录'));
    }
    // 网络错误 / 5xx：统一 Toast。
    const msg = error.response?.data?.message || '网络异常，请稍后重试';
    toast.error(msg);
    return Promise.reject(error);
  },
);

/** 普通 POST：拆包络后返回 data。 */
export async function post<T>(url: string, data?: unknown): Promise<T> {
  const res = await http.post<ApiResponse<T>>(url, data);
  return res.data.data;
}

/** GET：拆包络后返回 data（少数 GET 接口用，如 getCurrentUser）。 */
export async function get<T>(url: string, params?: object): Promise<T> {
  const res = await http.get<ApiResponse<T>>(url, { params });
  return res.data.data;
}

/** 空间内 POST：自动带上当前 spaceCode（页面不重复传，《接口层.md》§五）。 */
export function postScoped<T>(url: string, data?: object): Promise<T> {
  return post<T>(url, { spaceCode: getSpaceCode(), ...data });
}

/** 空间内分页 POST：自动带上当前 spaceCode。 */
export function postScopedPage<T>(url: string, data?: object): Promise<PageResult<T>> {
  return postPage<T>(url, { spaceCode: getSpaceCode(), ...data });
}

/** 分页 POST：拆包络后返回 { list, total, pageNum, pageSize }。 */
export async function postPage<T>(url: string, data?: unknown): Promise<PageResult<T>> {
  const res = await http.post<ApiResponse<T[]>>(url, data);
  const body = res.data as ApiResponse<T[]> & {
    total?: number;
    pageNum?: number;
    pageSize?: number;
  };
  return {
    list: body.data ?? [],
    total: body.total ?? 0,
    pageNum: body.pageNum ?? 1,
    pageSize: body.pageSize ?? (body.data?.length ?? 0),
  };
}

export default http;
