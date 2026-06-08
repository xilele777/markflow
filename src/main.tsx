import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// 字体 · 自托管（《配色规范.md》：IBM Plex 全家族）。
// 选包说明：
//   - 拉丁/数字/英文用 @fontsource/ibm-plex-sans（4 字重）+ @fontsource/ibm-plex-mono（3 字重，code/编码字段视觉关键）。
//   - 简体中文（IBM Plex Sans SC）fontsource 未收录；全集打包 4-12MB 反而拖慢首屏。
//     theme.ts 的 fontfamily fallback 链含 -apple-system / BlinkMacSystemFont / sans-serif，
//     中文自然落到系统字体（macOS PingFang SC / Win Microsoft YaHei），视觉差异可忽略。
// 注：曾经 index.html 从 fonts.googleapis.com 拉，但 Google Fonts 在国内被墙、render-blocking
//     导致首屏白屏数十秒；改为同源自托管 woff2，Vite 会做内容哈希、走 Cache-Control: immutable。
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
