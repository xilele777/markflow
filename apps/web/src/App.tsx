// App —— 全局 Provider 装配：ConfigProvider(主题) + AntApp + QueryClientProvider + Router。
// 主题 token 全局只此一处来源 app/theme.ts；Toast 通过 ToastBridge 注入主题感知的 message 实例。
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { antdTheme } from '@/app/theme';
import { router } from '@/app/router';
import { queryClient } from '@/shared/api/queryClient';
import { NetworkStatusBar, ToastBridge } from '@/shared/components';

export default function App() {
  return (
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      <AntApp>
        <ToastBridge />
        <NetworkStatusBar />
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
