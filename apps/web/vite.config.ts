import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// 开发期把 /api 代理到本地后端（markflow-server，默认 8080）。
// 构建：手动分包，把框架 / 组件库 / Puck 拆成独立 chunk，入口只保留业务壳；
//       体积预算由 scripts/check-bundle-size.cjs 守门（npm run build:check）。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Puck 及其拖拽依赖：只有执行页 / 工具创建页用，按需加载。
          if (id.includes('@measured/puck') || id.includes('@dnd-kit')) return 'puck';
          // 框架：React 全家桶 + 路由 + 数据层 + 状态。
          if (
            /node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(
              id,
            )
          ) {
            return 'react';
          }
          if (id.includes('@tanstack') || id.includes('/zustand/') || id.includes('/axios/')) {
            return 'state';
          }
          // antd / rc-* 不强制合包：交给 Rollup 按引用关系拆，只在首屏用到的部分进入口预加载，
          // 仅懒加载页面用到的组件（Table / Upload / Drawer 等）随页面 chunk 按需下载。
          return undefined;
        },
      },
    },
  },
});
