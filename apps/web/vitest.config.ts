import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// 单元 / 组件测试配置（与 vite.config.ts 分离，避免把测试环境混进构建）。
// 环境：happy-dom（轻量、启动快）；测试文件放在源码旁：src/**/*.{test,spec}.{ts,tsx}。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
