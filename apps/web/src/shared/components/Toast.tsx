// Toast —— 轻提示（《组件清单.md》三）。落地 AntD App 的 message 实例（主题感知）。
// 用法：组件内 import { toast }；非组件环境（如 http 拦截器）也用 toast。
// App.tsx 顶层渲染 <ToastBridge/>，把 message 实例注入 holder，供全局静态调用。
import { App } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import { useEffect } from 'react';

// 兜底：Bridge 挂载前用 antd 静态 message（无主题上下文，但保证可用）。
import { message as staticMessage } from 'antd';

let api: MessageInstance = staticMessage;

/** 全局轻提示入口。 */
export const toast = {
  success: (content: string) => api.success(content),
  error: (content: string) => api.error(content),
  info: (content: string) => api.info(content),
  warning: (content: string) => api.warning(content),
  loading: (content: string) => api.loading(content),
};

/** 挂在 App 上下文内，把主题感知的 message 实例注入 holder。 */
export function ToastBridge() {
  const { message } = App.useApp();
  useEffect(() => {
    api = message;
    return () => {
      api = staticMessage;
    };
  }, [message]);
  return null;
}
