# 浏览器验收脚本（无头 Chrome + CDP）

对运行中的真实前端（Vite `http://localhost:5173`）与后端（`http://127.0.0.1:8080`）跑端到端流程。
不依赖 Playwright / Puppeteer，只用 Node ≥ 22 自带的 `fetch` / `WebSocket` 和本机 Chrome。

## 前置

- 后端：`lingshu-server` 已 `npm run infra:up` + `npm run dev`（8080）。
- 前端：`npm run dev`（5173）。
- Chrome：默认取 `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`（Windows）/ `/Applications/Google Chrome.app/...`（macOS）/ `google-chrome`（Linux）；可用第 3 个参数或环境变量 `LINGSHU_E2E_BROWSER` 覆盖。
- 系统管理员账号默认 `admin / admin123456`，与后端 `.env` 的 `LINGSHU_ADMIN_USERNAME` / `LINGSHU_ADMIN_INITIAL_PASSWORD` 一致；不同时用同名环境变量覆盖。

## 脚本

| 脚本 | 覆盖 | 用法 |
|---|---|---|
| `e2e-login.mjs` | M0：登录后按角色落地 | `node e2e/e2e-login.mjs <browserExe> <baseUrl> <username> <password> <expectedPath> [startPath]` |
| `e2e-m1.mjs` | M1：系统菜单四页 + 我的贡献 + 改密码 | `node e2e/e2e-m1.mjs [baseUrl] [browserExe]` |
| `e2e-m2.mjs` | M2：数据集直传 / 解析 / 预览 / 失败原因 | `node e2e/e2e-m2.mjs [baseUrl] [apiBase] [browserExe]` |
| `e2e-m3.mjs` | M3：建 case → 标注 → 驳回 → 重标 → 通过 → 导出 | `node e2e/e2e-m3.mjs [baseUrl] [apiBase] [browserExe]` |
| `e2e-m4.mjs` | M4：懒加载页面、内置工具自动保存、提交前校验、离线状态条、数据集轮询、前端性能页 | `node e2e/e2e-m4.mjs [baseUrl] [apiBase] [browserExe]` |

`lib/cdp.mjs` 是公共库（启动浏览器、`evaluate` / `waitFor` / `fill` / `clickByText` / `pickSelect` / `login` / `setOffline` 等）。
新脚本从它 import；M0–M3 脚本是早期独立版本，各自内置了同一套原语，保持原样可独立运行。

每次运行都用时间戳后缀造新用户 / 空间 / 工具 / 数据集，不清理（`npm run infra:reset` 可全清）。
失败时会在系统临时目录落一张截图并打印当前 URL 与页面文本。

## 已知坑

- antd 按钮文案带空格（「登 录」），文本匹配先去空白。
- 多 span 按钮（流程编排阶段 chip、Segmented）按子 span 匹配后 `closest('button')`。
- antd Select 下拉用 input 的 `aria-controls` 定位，避免多个 Select 串台。
- 上传用 `Page.setFileInputFiles`（e2e-m2）。
- 断网用 `Network.emulateNetworkConditions` 并同时派发 `offline` / `online` 事件（无头模式下 `navigator.onLine` 不一定跟着变）。
