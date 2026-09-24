// 浏览器验收公共库：启动本机 Chrome 无头 + CDP 驱动，封装 evaluate / waitFor / fill / click 等原语。
// 无第三方依赖（Node ≥ 22 自带 WebSocket / fetch）。各 e2e-mN.mjs 从这里 import。
//
// 坑位备忘（详见 docs/handoff/0008）：
//  - antd 按钮文案带空格（「登 录」），匹配文本一律先去空白；
//  - MutationObserver 要 observe(document) 才能抓到 message 容器；
//  - antd Select 的下拉用 input 的 aria-controls 定位，避免多个 Select 串台；
//  - 多 span 的按钮（阶段 chip / Segmented）按子 span 精确匹配后 closest('button')；
//  - Vite 只听 [::1]:5173，baseUrl 用 http://localhost:5173。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function defaultBrowserExe() {
  if (process.env.MARKFLOW_E2E_BROWSER) return process.env.MARKFLOW_E2E_BROWSER;
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe');
  }
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return 'google-chrome';
}

/** 系统管理员账号：与后端 .env 首启引导一致，可用环境变量覆盖。 */
export const ADMIN = {
  username: process.env.MARKFLOW_ADMIN_USERNAME ?? 'admin',
  password: process.env.MARKFLOW_ADMIN_INITIAL_PASSWORD ?? 'admin123456',
};

/** 直接调后端接口（造数据用）。 */
export function makeApi(apiBase) {
  return async function api(path, body, token) {
    const res = await fetch(apiBase + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json();
    if (!json.success) throw new Error(`${path} failed: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  };
}

/**
 * 启动浏览器并连上一个新页签。返回的 page 对象带全部原语；用完 await page.close()。
 * 页面新文档注入 window.__toasts 记录 antd message 文案。
 */
export async function launch({
  baseUrl,
  browserExe = defaultBrowserExe(),
  windowSize = '1400,900',
}) {
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
      `--window-size=${windowSize}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let version;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch {
      /* not ready */
    }
    await sleep(250);
  }
  if (!version) throw new Error('browser devtools endpoint not ready');

  let nextId = 1;
  const pending = new Map();
  const consoleErrors = [];
  const ws = await new Promise((resolve, reject) => {
    const sock = new WebSocket(version.webSocketDebuggerUrl);
    sock.addEventListener('open', () => resolve(sock));
    sock.addEventListener('error', (e) => reject(e));
    sock.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: ok, reject: ko } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) ko(new Error(`${msg.error.message} (${msg.error.data ?? ''})`));
        else ok(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(
          msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text,
        );
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(
          msg.params.args
            .map((a) => a.value ?? a.description ?? '')
            .join(' ')
            .slice(0, 200),
        );
      }
    });
  });
  function send(method, params = {}, sessionId) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  await send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `window.__toasts = [];
      const record = (root) => root.querySelectorAll && root.querySelectorAll('.ant-message-notice-content').forEach(n => window.__toasts.push(n.textContent));
      new MutationObserver((muts) => muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches && n.matches('.ant-message-notice-content')) window.__toasts.push(n.textContent); record(n); } })))
        .observe(document, { childList: true, subtree: true });`,
    },
    sessionId,
  );

  async function evaluate(expression) {
    const { result, exceptionDetails } = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? 'evaluate failed');
    }
    return result.value;
  }
  async function waitFor(expression, label, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await sleep(150);
    }
    throw new Error(`timeout waiting for ${label}`);
  }
  const FRAME = `document.querySelector('iframe')?.contentDocument`;
  const waitForText = (text, timeoutMs) =>
    waitFor(
      `document.body.innerText.includes(${JSON.stringify(text)})`,
      `text "${text}"`,
      timeoutMs,
    );
  const waitForToast = (text, timeoutMs = 10000) =>
    waitFor(
      `(window.__toasts || []).some(t => t.includes(${JSON.stringify(text)}))`,
      `toast "${text}"`,
      timeoutMs,
    );
  const waitForFrameText = (text, timeoutMs) =>
    waitFor(
      `!!(${FRAME}) && (${FRAME}).body.innerText.includes(${JSON.stringify(text)})`,
      `iframe text "${text}"`,
      timeoutMs,
    );
  async function navigate(path) {
    await evaluate('window.__toasts = []');
    await send('Page.navigate', { url: `${baseUrl}${path}` }, sessionId);
    await sleep(300);
  }
  function setValueExpr(elExpr, value) {
    return `(() => {
      const el = ${elExpr};
      if (!el) return 'missing';
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return el.value === ${JSON.stringify(value)} ? 'ok' : 'mismatch';
    })()`;
  }
  async function fill(id, value) {
    const ok = await evaluate(
      setValueExpr(`document.getElementById(${JSON.stringify(id)})`, value),
    );
    if (ok !== 'ok') throw new Error(`fill #${id}: ${ok}`);
  }
  async function fillByPlaceholder(placeholder, value, root = 'document') {
    const sel = `'input[placeholder=' + ${JSON.stringify(JSON.stringify(placeholder))} + '],textarea[placeholder=' + ${JSON.stringify(JSON.stringify(placeholder))} + ']'`;
    const ok = await evaluate(setValueExpr(`(${root})?.querySelector(${sel})`, value));
    if (ok !== 'ok') throw new Error(`fill "${placeholder}": ${ok}`);
  }
  async function clickByText(
    scopeSelector,
    text,
    tags = 'button,a,span,li,div',
    root = 'document',
  ) {
    const ok = await evaluate(`(() => {
      const base = ${root};
      if (!base) return 'no-root';
      const scope = ${scopeSelector ? `base.querySelector(${JSON.stringify(scopeSelector)})` : 'base'};
      if (!scope) return 'no-scope';
      const want = ${JSON.stringify(text)}.replace(/\\s+/g, '');
      const el = [...scope.querySelectorAll(${JSON.stringify(tags)})].find(e => e.textContent.replace(/\\s+/g, '') === want && e.offsetParent !== null);
      if (!el) return 'no-el';
      if (el.disabled) return 'disabled';
      el.click();
      return 'ok';
    })()`);
    if (ok !== 'ok') throw new Error(`click "${text}" in ${scopeSelector ?? 'document'}: ${ok}`);
  }
  /** 在 iframe 内按文本点按钮 / 选项（支持多 span 子元素）。 */
  async function clickInFrame(text, tags = 'button,.ant-segmented-item,.ant-radio-wrapper,label') {
    const ok = await evaluate(`(() => {
      const doc = ${FRAME};
      if (!doc) return 'no-frame';
      const want = ${JSON.stringify(text)}.replace(/\\s+/g, '');
      const norm = (t) => t.replace(/\\s+/g, '');
      const el = [...doc.querySelectorAll(${JSON.stringify(tags)})].find(e =>
        norm(e.textContent) === want || [...e.querySelectorAll('span,div')].some(s => norm(s.textContent) === want));
      if (!el) return 'no-el';
      if (el.disabled) return 'disabled';
      el.click();
      return 'ok';
    })()`);
    if (ok !== 'ok') throw new Error(`click "${text}" in iframe: ${ok}`);
  }
  /** 多 span 按钮（流程编排阶段 chip）：按子 span 精确匹配后点整个按钮。 */
  async function toggleStage(label) {
    const ok = await evaluate(`(() => {
      const span = [...document.querySelectorAll('button span')].find(e => e.children.length === 0 && e.textContent.replace(/\\s+/g, '') === ${JSON.stringify(label)}.replace(/\\s+/g, ''));
      const btn = span?.closest('button');
      if (!btn) return 'no-el';
      btn.click();
      return 'ok';
    })()`);
    if (ok !== 'ok') throw new Error(`toggle stage "${label}": ${ok}`);
  }
  async function clickRowAction(rowText, actionText) {
    const ok = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.ant-table-row')].find(r => r.innerText.includes(${JSON.stringify(rowText)}));
      if (!row) return 'no-row';
      const want = ${JSON.stringify(actionText)}.replace(/\\s+/g, '');
      const el = [...row.querySelectorAll('a,button,span')].find(e => e.textContent.replace(/\\s+/g, '') === want);
      if (!el) return 'no-action';
      el.click();
      return 'ok';
    })()`);
    if (ok !== 'ok') throw new Error(`row action "${actionText}" on "${rowText}": ${ok}`);
  }
  async function pickSelect(scopeSelector, index, optionTitle) {
    const info = await evaluate(`(() => {
      const sel = document.querySelectorAll(${JSON.stringify(scopeSelector)} + ' .ant-select')[${index}];
      if (!sel) return { error: 'no-select' };
      if (!sel.classList.contains('ant-select-open')) {
        sel.querySelector('.ant-select-selector').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
      const input = sel.querySelector('input.ant-select-selection-search-input');
      return { listId: input ? (input.getAttribute('aria-controls') || input.id + '_list') : null };
    })()`);
    if (info.error) throw new Error(`open select #${index}: ${info.error}`);
    const dropdownExpr = `(document.getElementById(${JSON.stringify(info.listId)})?.closest('.ant-select-dropdown') ?? [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].pop())`;
    const optionExpr = `[...((${dropdownExpr})?.querySelectorAll('.ant-select-item-option') ?? [])].find(o => (o.getAttribute('title') || o.textContent) === ${JSON.stringify(optionTitle)})`;
    await waitFor(`!!${optionExpr}`, `select option "${optionTitle}"`, 8000);
    await evaluate(`${optionExpr}.click(); true`);
    await sleep(150);
  }
  async function login(username, password, expectedPath) {
    await navigate('/login');
    await evaluate(`localStorage.clear(); true`);
    await navigate('/login');
    await waitFor(
      `location.pathname === '/login' && !!document.querySelector('#username')`,
      'login form',
    );
    await fill('username', username);
    await fill('password', password);
    await evaluate(`document.querySelector('button[type="submit"]').click(); true`);
    await waitFor(
      `location.pathname === ${JSON.stringify(expectedPath)}`,
      `landing ${expectedPath}`,
    );
    await waitFor(`!!localStorage.getItem('markflow.token')`, 'token stored');
  }
  /** 我的任务组 → 点开 caseName 对应、带某阶段标签的组。 */
  async function openMyGroup(caseName, stageLabel) {
    await navigate('/my-groups');
    const rowExpr = `[...document.querySelectorAll('.ant-table-row')].find(r => r.innerText.includes(${JSON.stringify(caseName)}) && r.innerText.includes(${JSON.stringify(stageLabel)}))`;
    await waitFor(`!!${rowExpr}`, `group row ${stageLabel}`);
    const ok = await evaluate(`(() => {
      const row = ${rowExpr};
      const link = [...row.querySelectorAll('a,button,span')].find(e => e.textContent.replace(/\\s+/g, '') === '进入');
      if (!link) return 'no-link';
      link.click();
      return 'ok';
    })()`);
    if (ok !== 'ok') throw new Error(`open group: ${ok}`);
    await waitFor(`/^\\/my-groups\\/\\d+$/.test(location.pathname)`, 'group detail');
    await waitFor(`document.querySelectorAll('.ant-table-row').length > 0`, 'group tasks');
  }
  /** 模拟断网 / 恢复（CDP Network.emulateNetworkConditions）。 */
  async function setOffline(offline) {
    await send(
      'Network.emulateNetworkConditions',
      { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
      sessionId,
    );
  }
  async function screenshot(file) {
    const png = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(file, Buffer.from(png.data, 'base64'));
    return file;
  }
  async function close() {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    browser.kill();
    await sleep(500);
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  return {
    baseUrl,
    consoleErrors,
    send: (method, params) => send(method, params, sessionId),
    evaluate,
    waitFor,
    waitForText,
    waitForToast,
    waitForFrameText,
    FRAME,
    navigate,
    fill,
    fillByPlaceholder,
    clickByText,
    clickInFrame,
    toggleStage,
    clickRowAction,
    pickSelect,
    login,
    openMyGroup,
    setOffline,
    screenshot,
    close,
  };
}

/** 步骤记录器：run(name, fn) 记录耗时与结果，最后 report() 打表并返回是否全过。 */
export function createSteps() {
  const steps = [];
  return {
    async run(name, fn) {
      const started = Date.now();
      try {
        await fn();
        steps.push({ step: name, ok: true, ms: Date.now() - started });
      } catch (err) {
        steps.push({ step: name, ok: false, ms: Date.now() - started, error: err.message });
        throw err;
      }
    },
    report(label) {
      console.table(steps);
      const ok = steps.every((s) => s.ok);
      console.log(ok ? `ALL ${steps.length} ${label} STEPS PASSED` : `${label} FAILED`);
      return ok;
    },
  };
}

/** 失败时统一收尾：截图 + URL + 页面文本。 */
export async function dumpFailure(page, tag) {
  try {
    const file = join(tmpdir(), `markflow-${tag}-fail.png`);
    await page.screenshot(file);
    console.error('screenshot:', file);
  } catch {
    /* ignore */
  }
  try {
    console.error('URL:', await page.evaluate('location.href'));
    console.error('BODY:', (await page.evaluate('document.body.innerText')).slice(0, 1500));
  } catch {
    /* ignore */
  }
}
