// M1 浏览器验收：本机 Chrome 无头 + CDP 驱动真实前端（Vite 5173 → 后端 8080），
// 走"系统"菜单四页（用户 / 工作空间 / 标注工具 / AI 配置）+ 我的贡献 + 修改密码。
// 无第三方依赖（Node ≥ 22 自带 WebSocket / fetch）。
// 用法：node e2e-m1.mjs [baseUrl] [browserExe]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:5173';
const browserExe =
  process.argv[3] ??
  join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe');
// 系统管理员：与后端 .env 的首启引导账号一致（MARKFLOW_ADMIN_USERNAME / MARKFLOW_ADMIN_INITIAL_PASSWORD）。
const ADMIN = {
  username: process.env.MARKFLOW_ADMIN_USERNAME ?? 'admin',
  password: process.env.MARKFLOW_ADMIN_INITIAL_PASSWORD ?? 'admin123456',
};
const stamp = Date.now().toString(36).slice(-5);
const NEW_USER = {
  username: `e2e${stamp}`,
  displayName: `验收用户${stamp}`,
  password: 'e2epass1',
  newPassword: 'e2epass2',
};
const WS = { spaceCode: `e2e-ws-${stamp}`, name: `验收空间${stamp}`, description: 'M1 浏览器验收' };
const TOOL = {
  code: `e2e-tool-${stamp}`,
  name: `验收工具${stamp}`,
  url: 'https://tool.example.com/label',
};
const AI = {
  code: `e2e-ai-${stamp}`,
  name: `验收模型${stamp}`,
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-e2e-secret',
  prompt: '你是标注助手',
};
const SCHEMA = JSON.stringify(
  {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  null,
  2,
);

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
    '--window-size=1400,900',
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
const consoleErrors = [];
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
}
function send(ws, method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

// ---- 页面驱动原语 ----
let ws;
let sessionId;
async function evaluate(expression) {
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
async function waitFor(expression, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${label}`);
}
const waitForText = (text, timeoutMs) =>
  waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, `text "${text}"`, timeoutMs);
const waitForNoText = (text, timeoutMs) =>
  waitFor(
    `!document.body.innerText.includes(${JSON.stringify(text)})`,
    `absence of "${text}"`,
    timeoutMs,
  );
const waitForToast = (text) =>
  waitFor(
    `(window.__toasts || []).some(t => t.includes(${JSON.stringify(text)}))`,
    `toast "${text}"`,
    10000,
  );
async function navigate(path) {
  await evaluate('window.__toasts = []');
  await send(ws, 'Page.navigate', { url: `${baseUrl}${path}` }, sessionId);
  await sleep(300);
}
async function fill(id, value) {
  const ok = await evaluate(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return 'missing';
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value === ${JSON.stringify(value)} ? 'ok' : 'mismatch';
  })()`);
  if (ok !== 'ok') throw new Error(`fill #${id}: ${ok}`);
}
async function clickByText(scopeSelector, text, tags = 'button,a,span,li,div') {
  // antd 会给两字中文按钮插入空格（"创 建"），比较时去掉全部空白。
  const ok = await evaluate(`(() => {
    const scope = ${scopeSelector ? `document.querySelector(${JSON.stringify(scopeSelector)})` : 'document'};
    if (!scope) return 'no-scope';
    const want = ${JSON.stringify(text)}.replace(/\\s+/g, '');
    const el = [...scope.querySelectorAll(${JSON.stringify(tags)})].find(e => e.textContent.replace(/\\s+/g, '') === want && e.offsetParent !== null);
    if (!el) return 'no-el';
    el.click();
    return 'ok';
  })()`);
  if (ok !== 'ok') throw new Error(`click "${text}" in ${scopeSelector ?? 'document'}: ${ok}`);
}
async function clickRowAction(rowText, actionText) {
  const ok = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.ant-table-row')].find(r => r.innerText.includes(${JSON.stringify(rowText)}));
    if (!row) return 'no-row';
    const el = [...row.querySelectorAll('a,button,span')].find(e => e.textContent.trim() === ${JSON.stringify(actionText)});
    if (!el) return 'no-action';
    el.click();
    return 'ok';
  })()`);
  if (ok !== 'ok') throw new Error(`row action "${actionText}" on "${rowText}": ${ok}`);
}
async function clickModalOk() {
  await waitFor(
    `(() => { const b = document.querySelector('.ant-modal-footer .ant-btn-primary'); return !!b && !b.disabled; })()`,
    'modal OK enabled',
  );
  await evaluate(`document.querySelector('.ant-modal-footer .ant-btn-primary').click(); true`);
}
/** antd Select：按容器内序号打开下拉，在"属于该下拉"的 listbox 里点选 title 匹配的选项；可先输入搜索词（远程搜索）。 */
async function pickSelect(scopeSelector, index, optionTitle, { search, exact = true } = {}) {
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
  if (search !== undefined) {
    await sleep(200);
    const typed = await evaluate(`(() => {
      const sel = document.querySelectorAll(${JSON.stringify(scopeSelector)} + ' .ant-select')[${index}];
      const input = sel.querySelector('input.ant-select-selection-search-input');
      if (!input) return 'no-input';
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(search)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`);
    if (typed !== 'ok') throw new Error(`type into select #${index}: ${typed}`);
  }
  const dropdownExpr = `(document.getElementById(${JSON.stringify(info.listId)})?.closest('.ant-select-dropdown') ?? [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].pop())`;
  const optionExpr = `[...((${dropdownExpr})?.querySelectorAll('.ant-select-item-option') ?? [])].find(o => { const t = o.getAttribute('title') || o.textContent; return ${exact ? 't === ' : 't.includes('}${JSON.stringify(optionTitle)}${exact ? '' : ')'}; })`;
  await waitFor(`!!${optionExpr}`, `select option "${optionTitle}"`, 8000);
  await evaluate(`${optionExpr}.click(); true`);
  await sleep(150);
}
async function login(username, password, expectedPath) {
  await navigate('/login');
  await waitFor(
    `location.pathname === '/login' && !!document.querySelector('#username')`,
    'login form',
  );
  await fill('username', username);
  await fill('password', password);
  await evaluate(`document.querySelector('button[type="submit"]').click(); true`);
  await waitFor(`location.pathname === ${JSON.stringify(expectedPath)}`, `landing ${expectedPath}`);
  await waitFor(`!!localStorage.getItem('markflow.token')`, 'token stored');
}
async function logout() {
  await evaluate(`document.querySelector('header .ant-avatar').click(); true`);
  await waitFor(
    `[...document.querySelectorAll('.ant-dropdown-menu-item')].some(i => i.textContent.trim() === '退出登录')`,
    'avatar menu',
  );
  await clickByText(null, '退出登录', '.ant-dropdown-menu-item');
  await waitFor(`location.pathname === '/login'`, 'back to /login');
}

// ---- 步骤 ----
const steps = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    steps.push({ step: name, ok: true, ms: Date.now() - started });
  } catch (err) {
    steps.push({ step: name, ok: false, ms: Date.now() - started, error: err.message });
    throw err;
  }
}

let exitCode = 1;
try {
  const { webSocketDebuggerUrl } = await waitForDevtools();
  ws = await connect(webSocketDebuggerUrl);
  const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true }));
  await send(ws, 'Page.enable', {}, sessionId);
  await send(ws, 'Runtime.enable', {}, sessionId);
  // 记录每个文档里出现过的 antd message 文本（toast 3 秒即消失，轮询容易错过）。
  await send(
    ws,
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `window.__toasts = [];
      const record = (root) => root.querySelectorAll && root.querySelectorAll('.ant-message-notice-content').forEach(n => window.__toasts.push(n.textContent));
      new MutationObserver((muts) => muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches && n.matches('.ant-message-notice-content')) window.__toasts.push(n.textContent); record(n); } })))
        .observe(document, { childList: true, subtree: true });`,
    },
    sessionId,
  );

  await step('admin 登录 → /dataset', () => login(ADMIN.username, ADMIN.password, '/dataset'));

  await step('用户管理：添加用户', async () => {
    await navigate('/user');
    await waitForText('添加用户');
    await clickByText(null, '添加用户', 'button');
    await waitFor(`!!document.querySelector('.ant-modal #username')`, 'add user modal');
    await fill('username', NEW_USER.username);
    await fill('displayName', NEW_USER.displayName);
    await fill('password', NEW_USER.password);
    await clickModalOk();
    await waitForToast('用户已创建');
    await waitForText(NEW_USER.username);
  });

  await step('用户管理：关键字搜索', async () => {
    await evaluate(`(() => {
      const input = document.querySelector('.ant-input[placeholder]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(NEW_USER.displayName)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      return true;
    })()`);
    await waitFor(
      `document.querySelectorAll('.ant-table-row').length === 1 && document.body.innerText.includes(${JSON.stringify(NEW_USER.username)})`,
      'filtered user list',
    );
  });

  await step('工作空间：新建空间', async () => {
    await navigate('/workspace');
    await waitForText('新建空间');
    await clickByText(null, '新建空间', 'button');
    await waitFor(`!!document.querySelector('.ant-modal #spaceCode')`, 'create workspace modal');
    await fill('spaceCode', WS.spaceCode);
    await fill('name', WS.name);
    await fill('description', WS.description);
    await clickModalOk();
    await waitForToast('工作空间已创建');
    await waitForText(WS.spaceCode);
    // 左下角切换器应包含新空间（refreshCurrentUser）
    await waitForText(WS.name);
  });

  await step('工作空间：详情抽屉 + 添加成员（标注员 + 标注管理员）', async () => {
    await clickRowAction(WS.spaceCode, '查看详情');
    await waitFor(
      `!!document.querySelector('.ant-drawer-open') && document.querySelector('.ant-drawer-open').innerText.includes('添加成员')`,
      'workspace drawer',
    );
    await clickByText('.ant-drawer-open', '添加成员', 'button');
    await waitFor(
      `!!document.querySelector('.ant-modal') && document.querySelector('.ant-modal').innerText.includes('添加成员')`,
      'add member modal',
    );
    await pickSelect('.ant-modal', 0, NEW_USER.username, {
      search: NEW_USER.username,
      exact: false,
    });
    await pickSelect('.ant-modal', 1, '标注员');
    await pickSelect('.ant-modal', 1, '标注管理员');
    await clickModalOk();
    await waitForToast('成员已添加');
    await waitFor(
      `(() => { const d = document.querySelector('.ant-drawer-open'); return !!d && d.innerText.includes(${JSON.stringify(NEW_USER.displayName)}) && d.innerText.includes('标注员') && d.innerText.includes('标注管理员') && d.innerText.includes('正常'); })()`,
      'member row in drawer',
    );
    await evaluate(`document.querySelector('.ant-drawer-open .ant-drawer-close').click(); true`);
    await waitFor(`!document.querySelector('.ant-drawer-open')`, 'drawer closed');
  });

  await step('标注工具：创建 IFRAME 工具', async () => {
    await navigate('/labeltool');
    await waitForText('创建标注工具');
    await clickByText(null, '创建标注工具', 'button');
    await waitForText('外部工具（IFRAME 接入）');
    await clickByText('.ant-modal', '外部工具（IFRAME 接入）', 'div');
    await waitFor(
      `!!document.querySelector('.ant-drawer-open #labelToolCode')`,
      'iframe tool drawer',
    );
    await fill('labelToolCode', TOOL.code);
    await fill('labelToolName', TOOL.name);
    await fill('labelToolUrl', TOOL.url);
    await fill('labelToolJsonSchema', SCHEMA);
    await clickByText('.ant-drawer-open .ant-drawer-footer', '创建', 'button');
    await waitForToast('标注工具已创建');
    await waitForText(TOOL.code);
    await waitFor(
      `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes(${JSON.stringify(TOOL.code)}) && r.innerText.includes('IFRAME'))`,
      'tool row with IFRAME tag',
    );
  });

  await step('标注工具：详情抽屉回显 schema', async () => {
    await clickRowAction(TOOL.code, '查看详情');
    await waitFor(
      `(() => { const d = document.querySelector('.ant-drawer-open'); return !!d && d.innerText.includes(${JSON.stringify(TOOL.url)}) && d.innerText.includes('text'); })()`,
      'tool detail drawer',
    );
    await evaluate(`document.querySelector('.ant-drawer-open .ant-drawer-close').click(); true`);
    await waitFor(`!document.querySelector('.ant-drawer-open')`, 'drawer closed');
  });

  await step('AI 配置：新建', async () => {
    await navigate('/aiconfig');
    await waitForText('新建 AI 配置');
    await clickByText(null, '新建 AI 配置', 'button');
    await waitFor(`!!document.querySelector('.ant-drawer-open #aiCode')`, 'ai config drawer');
    await fill('aiCode', AI.code);
    await fill('name', AI.name);
    await pickSelect('.ant-drawer-open', 0, TOOL.name);
    await fill('model', AI.model);
    await fill('baseUrl', AI.baseUrl);
    await fill('apiKey', AI.apiKey);
    await fill('prompt', AI.prompt);
    await clickByText('.ant-drawer-open .ant-drawer-footer', '创建', 'button');
    await waitForToast('AI 配置已创建');
    await waitFor(
      `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes(${JSON.stringify(AI.code)}) && r.innerText.includes(${JSON.stringify(TOOL.name)}) && r.innerText.includes(${JSON.stringify(AI.model)}))`,
      'ai config row',
    );
  });

  await step('AI 配置：编辑（apiKey 留空保留）', async () => {
    await clickRowAction(AI.code, '编辑');
    await waitFor(
      `(() => { const el = document.querySelector('.ant-drawer-open #name'); return !!el && el.value === ${JSON.stringify(AI.name)}; })()`,
      'edit drawer prefilled',
    );
    const disabled = await evaluate(
      `document.querySelector('.ant-drawer-open #aiCode').disabled && document.querySelector('.ant-drawer-open #apiKey').value === ''`,
    );
    if (!disabled) throw new Error('edit drawer: aiCode should be disabled and apiKey empty');
    await fill('name', `${AI.name}改`);
    await fill('model', 'gpt-4.1');
    await clickByText('.ant-drawer-open .ant-drawer-footer', '保存', 'button');
    await waitForToast('AI 配置已更新');
    await waitFor(
      `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes(${JSON.stringify(`${AI.name}改`)}) && r.innerText.includes('gpt-4.1'))`,
      'ai config row updated',
    );
  });

  await step('我的贡献：管理员自己（空态）与查看成员', async () => {
    await navigate('/contribution');
    await waitForText('该用户暂无贡献记录');
    await waitForText('系统管理员');
    await navigate(`/contribution?username=${NEW_USER.username}`);
    await waitForText('成员贡献');
    await waitForText(NEW_USER.displayName);
    await waitForText(WS.name);
    await waitForText('标注员 · 标注管理员');
  });

  await step('退出 → 新用户（LABEL_ADMIN）登录 → /dataset，无"用户管理"菜单', async () => {
    await logout();
    await login(NEW_USER.username, NEW_USER.password, '/dataset');
    await waitForText('我的任务组');
    await waitForNoText('用户管理', 3000);
    await waitForText(WS.name);
  });

  await step('修改密码 → 重新登录', async () => {
    await evaluate(`document.querySelector('header .ant-avatar').click(); true`);
    await waitFor(
      `[...document.querySelectorAll('.ant-dropdown-menu-item')].some(i => i.textContent.trim() === '修改密码')`,
      'avatar menu',
    );
    await clickByText(null, '修改密码', '.ant-dropdown-menu-item');
    await waitFor(`!!document.querySelector('.ant-modal #oldPassword')`, 'change password modal');
    await fill('oldPassword', 'wrong-old');
    await fill('newPassword', NEW_USER.newPassword);
    await fill('confirmPassword', NEW_USER.newPassword);
    await clickModalOk();
    await waitForToast('原密码错误');
    await fill('oldPassword', NEW_USER.password);
    await clickModalOk();
    await waitForToast('密码已修改');
    await logout();
    await login(NEW_USER.username, NEW_USER.newPassword, '/dataset');
  });

  exitCode = 0;
} catch (err) {
  console.error('E2E FAILED:', err.message);
  try {
    const snapshot = await evaluate(
      `JSON.stringify({ path: location.pathname, toasts: window.__toasts, text: document.body.innerText.slice(0, 1500) })`,
    );
    console.error('page snapshot:', snapshot);
  } catch {
    /* ignore */
  }
} finally {
  console.table(steps);
  console.log(
    JSON.stringify(
      {
        created: { user: NEW_USER.username, workspace: WS.spaceCode, tool: TOOL.code, ai: AI.code },
        consoleErrors,
      },
      null,
      2,
    ),
  );
  console.log(exitCode === 0 ? `ALL ${steps.length} E2E STEPS PASSED` : 'E2E FAILED');
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  browser.kill();
  await sleep(300);
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(exitCode);
}
