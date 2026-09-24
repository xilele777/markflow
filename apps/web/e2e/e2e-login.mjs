// M0 验收脚本：用本机 Chrome/Edge 无头模式经 CDP 驱动真实前端完成登录，检查落地路径。
// 无第三方依赖（Node ≥ 22 自带 WebSocket / fetch）。
// 用法：node e2e-login.mjs <browserExe> <baseUrl> <username> <password> <expectedPath> [startPath]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [browserExe, baseUrl, username, password, expectedPath, startPath = '/login'] =
  process.argv.slice(2);
if (!browserExe || !baseUrl || !username || !password || !expectedPath) {
  console.error(
    'usage: node e2e-login.mjs <browserExe> <baseUrl> <username> <password> <expectedPath> [startPath]',
  );
  process.exit(2);
}

const port = 9300 + Math.floor(Math.random() * 200);
const userDataDir = mkdtempSync(join(tmpdir(), 'markflow-e2e-'));
const browser = spawn(
  browserExe,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* not ready */
    }
    await sleep(250);
  }
  throw new Error('browser devtools endpoint not ready');
}

let nextId = 1;
const pending = new Map();
const events = [];

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (e) => reject(e));
    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: ok, reject: ko } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) ko(new Error(`${msg.error.message} (${msg.error.data ?? ''})`));
        else ok(msg.result);
      } else if (msg.method) {
        events.push(msg);
      }
    });
  });
}

function send(ws, method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function evaluate(ws, sessionId, expression) {
  const { result, exceptionDetails } = await send(
    ws,
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (exceptionDetails)
    throw new Error(exceptionDetails.exception?.description ?? 'evaluate failed');
  return result.value;
}

async function waitFor(ws, sessionId, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(ws, sessionId, expression)) return;
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const FILL = (id, value) => `(() => {
  const el = document.querySelector('#${id}');
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return el.value === ${JSON.stringify(value)};
})()`;

let exitCode = 1;
try {
  const { webSocketDebuggerUrl } = await waitForDevtools();
  const ws = await connect(webSocketDebuggerUrl);
  const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });
  await send(ws, 'Page.enable', {}, sessionId);
  await send(ws, 'Runtime.enable', {}, sessionId);
  await send(ws, 'Page.navigate', { url: `${baseUrl}${startPath}` }, sessionId);

  await waitFor(
    ws,
    sessionId,
    `location.pathname === '/login' && !!document.querySelector('#username') && !!document.querySelector('#password')`,
    20000,
    'login form',
  );
  const fromState = await evaluate(
    ws,
    sessionId,
    `history.state && history.state.usr ? JSON.stringify(history.state.usr) : null`,
  );

  if (!(await evaluate(ws, sessionId, FILL('username', username))))
    throw new Error('fill username failed');
  if (!(await evaluate(ws, sessionId, FILL('password', password))))
    throw new Error('fill password failed');
  await evaluate(ws, sessionId, `document.querySelector('button[type="submit"]').click(); true`);

  await waitFor(
    ws,
    sessionId,
    `location.pathname !== '/login'`,
    20000,
    'navigation away from /login',
  );
  await sleep(800);
  const pathname = await evaluate(ws, sessionId, 'location.pathname');
  const tokenStored = await evaluate(ws, sessionId, `!!localStorage.getItem('markflow.token')`);
  const spaceCode = await evaluate(ws, sessionId, `localStorage.getItem('markflow.spaceCode')`);
  const toastText = await evaluate(
    ws,
    sessionId,
    `[...document.querySelectorAll('.ant-message-notice-content, .ant-notification-notice')].map(n => n.textContent).join(' | ')`,
  );
  const consoleErrors = events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map(
      (e) => e.params.exceptionDetails?.exception?.description ?? e.params.exceptionDetails?.text,
    );

  const ok = pathname === expectedPath && tokenStored;
  console.log(
    JSON.stringify(
      {
        username,
        startPath,
        fromState,
        landed: pathname,
        expected: expectedPath,
        tokenStored,
        spaceCode,
        toastText,
        consoleErrors,
        ok,
      },
      null,
      2,
    ),
  );
  exitCode = ok ? 0 : 1;
  ws.close();
} catch (err) {
  console.error('E2E FAILED:', err.message);
} finally {
  browser.kill();
  await sleep(300);
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(exitCode);
}
