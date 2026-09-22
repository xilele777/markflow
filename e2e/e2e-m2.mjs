// M2 浏览器验收：本机 Chrome 无头 + CDP 驱动真实前端（Vite 5173 → 后端 8080；文件直传 MinIO 9000）。
// 流程：API 造主数据 → 空间管理员登录 → 新建数据集（选工具、直传 jsonl）→ 列表 → 详情等待就绪 → 预览样本
//      → 新建版本（含坏行）→ 详情看跳过统计与错误明细 → API 造一个 .csv 版本 → 详情看"解析失败"与原因。
// 无第三方依赖（Node ≥ 22 自带 WebSocket / fetch）。用法：node e2e-m2.mjs [baseUrl] [apiBase] [browserExe]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:5173';
const apiBase = process.argv[3] ?? 'http://127.0.0.1:8080';
const browserExe =
  process.argv[4] ??
  join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe');
// 系统管理员：与后端 .env 的首启引导账号一致（LINGSHU_ADMIN_USERNAME / LINGSHU_ADMIN_INITIAL_PASSWORD）。
const ADMIN = {
  username: process.env.LINGSHU_ADMIN_USERNAME ?? 'admin',
  password: process.env.LINGSHU_ADMIN_INITIAL_PASSWORD ?? 'admin123456',
};
const stamp = Date.now().toString(36).slice(-5);
const USER = { username: `e2m${stamp}`, displayName: `验收管理员${stamp}`, password: 'e2epass1' };
const WS = { spaceCode: `e2e-m2-${stamp}`, name: `验收空间M2${stamp}` };
const TOOL = { code: `e2e-m2-tool-${stamp}`, name: `验收工具M2${stamp}` };
const DATASET = { name: `验收数据集${stamp}`, desc: 'M2 浏览器验收', versionDesc: '首版' };
const SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: { text: { type: 'string' }, bizId: { type: 'string' } },
  required: ['text'],
};

const workDir = mkdtempSync(join(tmpdir(), 'lingshu-e2e-m2-'));
const goodFile = join(workDir, 'good.jsonl');
const mixedFile = join(workDir, 'mixed.jsonl');
writeFileSync(
  goodFile,
  '{"text":"第一条","bizId":"b1"}\n{"text":"第二条","bizId":"b2"}\n{"text":"第三条"}\n',
);
writeFileSync(mixedFile, '{"text":"好行"}\n这不是 JSON\n{"bizId":"缺 text"}\n');

const port = 9300 + Math.floor(Math.random() * 200);
const userDataDir = mkdtempSync(join(tmpdir(), 'lingshu-e2e-'));
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

// ---- API 造数 ----
async function api(path, body, token) {
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
}

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
  const ok = await evaluate(`(() => {
    const scope = ${scopeSelector ? `document.querySelector(${JSON.stringify(scopeSelector)})` : 'document'};
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
/** 通过 CDP 给页面里的 <input type=file> 设置文件（Chrome 会自行派发 input/change 事件）。 */
async function setFile(path) {
  const { root } = await send(ws, 'DOM.getDocument', { depth: 1 }, sessionId);
  const { nodeId } = await send(
    ws,
    'DOM.querySelector',
    { nodeId: root.nodeId, selector: 'input[type="file"]' },
    sessionId,
  );
  if (!nodeId) throw new Error('file input not found');
  await send(ws, 'DOM.setFileInputFiles', { nodeId, files: [path] }, sessionId);
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
  await waitFor(`!!localStorage.getItem('lingshu.token')`, 'token stored');
}
/** 详情页不自动刷新解析状态（无 refetchInterval），验收时重新进入详情页直到出现目标状态文案。 */
async function reloadDetailUntil(datasetId, text, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await navigate(`/dataset/${datasetId}`);
    await waitForText('数据集详情');
    await sleep(600);
    if (await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)) return;
    if (Date.now() > deadline) throw new Error(`detail never showed "${text}"`);
    await sleep(800);
  }
}

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
let datasetId;
try {
  // ---- API 造主数据：空间 / 空间管理员 / 标注工具 ----
  const adminToken = (await api('/api/auth/login', ADMIN)).data.token;
  const wsId = (await api('/api/workspace/createWorkspace', WS, adminToken)).data.workspaceId;
  const userId = (await api('/api/user/create', USER, adminToken)).data.userId;
  await api(
    '/api/workspace/addWorkspaceMember',
    { workspaceId: wsId, members: [{ userId, roles: [3] }] },
    adminToken,
  );
  await api(
    '/api/labeltool/createLabelTool',
    {
      labelToolCode: TOOL.code,
      labelToolName: TOOL.name,
      labelToolType: 1,
      labelToolJsonSchema: SCHEMA,
      labelToolPageSchema: null,
    },
    adminToken,
  );
  const userToken = (
    await api('/api/auth/login', { username: USER.username, password: USER.password })
  ).data.token;

  const { webSocketDebuggerUrl } = await waitForDevtools();
  ws = await connect(webSocketDebuggerUrl);
  const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true }));
  await send(ws, 'Page.enable', {}, sessionId);
  await send(ws, 'Runtime.enable', {}, sessionId);
  await send(ws, 'DOM.enable', {}, sessionId);
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

  await step('空间管理员登录 → /dataset（空态）', async () => {
    await login(USER.username, USER.password, '/dataset');
    await waitForText(WS.name);
    await waitForText('新建数据集');
    await waitForText('暂无数据集');
  });

  await step('新建数据集：表单 + 直传 jsonl（浏览器 → MinIO）', async () => {
    await navigate('/dataset/new');
    await waitForText('新建数据集');
    await waitFor(`!!document.getElementById('datasetName')`, 'dataset form');
    await fill('datasetName', DATASET.name);
    await pickSelect('form', 0, TOOL.name);
    await fill('datasetDesc', DATASET.desc);
    await fill('versionDesc', DATASET.versionDesc);
    await setFile(goodFile);
    await waitForText('已上传', 20000);
    await waitForText('good.jsonl');
    await waitFor(
      `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.replace(/\\s+/g, '') === '创建数据集'); return !!b && !b.disabled; })()`,
      'submit enabled',
    );
    await clickByText(null, '创建数据集', 'button');
    await waitForToast('数据集创建成功');
    await waitFor(`location.pathname === '/dataset'`, 'back to list');
  });

  await step('列表：新数据集出现，v1，标注工具编码', async () => {
    await waitForText(DATASET.name);
    await waitFor(
      `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes(${JSON.stringify(DATASET.name)}) && r.innerText.includes('v1') && r.innerText.includes(${JSON.stringify(TOOL.code)}) && r.innerText.includes(${JSON.stringify(USER.username)}))`,
      'dataset row',
    );
    datasetId = await evaluate(
      `(() => { const row = [...document.querySelectorAll('.ant-table-row')].find(r => r.innerText.includes(${JSON.stringify(DATASET.name)})); return Number(row.querySelector('td').innerText); })()`,
    );
    if (!Number.isFinite(datasetId)) throw new Error(`bad datasetId ${datasetId}`);
  });

  await step('详情：v1 解析后显示"就绪"与样本数 3', async () => {
    await clickRowAction(DATASET.name, '查看详情');
    await waitForText('数据集详情');
    await waitForText(DATASET.desc);
    await reloadDetailUntil(datasetId, '就绪');
    await waitFor(
      `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes('v1') && r.innerText.includes('就绪') && /\\b3\\b/.test(r.innerText))`,
      'v1 ready row',
    );
  });

  await step('预览样本抽屉：解析统计 + 三条样本 JSON', async () => {
    await clickRowAction('v1', '预览样本');
    await waitFor(
      `!!document.querySelector('.ant-drawer-open') && document.querySelector('.ant-drawer-open').innerText.includes('解析统计')`,
      'preview drawer',
    );
    await waitFor(
      `(() => { const d = document.querySelector('.ant-drawer-open'); return d.innerText.includes('总行数 3') && d.innerText.includes('成功 3') && d.innerText.includes('跳过 0') && d.innerText.includes('第一条') && d.innerText.includes('b2') && d.innerText.includes('第三条'); })()`,
      'preview content',
    );
    await evaluate(`document.querySelector('.ant-drawer-open .ant-drawer-close').click(); true`);
    await waitFor(`!document.querySelector('.ant-drawer-open')`, 'drawer closed');
  });

  await step('新建版本：直传含坏行的 jsonl → v2 就绪、跳过 2、错误明细可见', async () => {
    await clickByText(null, '新建版本', 'button');
    await waitFor(`location.pathname === '/dataset/${datasetId}/version/new'`, 'version new page');
    await waitForText('新建版本');
    await setFile(mixedFile);
    await waitForText('已上传', 20000);
    await fill('versionDesc', '含坏行的版本');
    await clickByText(null, '创建版本', 'button');
    await waitForToast('版本创建成功');
    await waitFor(`location.pathname === '/dataset/${datasetId}'`, 'back to detail');
    await reloadDetailUntil(datasetId, '含坏行的版本');
    await waitFor(
      `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes('v2') && r.innerText.includes('就绪'))`,
      'v2 ready',
      30000,
    );
    await clickRowAction('v2', '预览样本');
    await waitFor(
      `(() => { const d = document.querySelector('.ant-drawer-open'); return !!d && d.innerText.includes('总行数 3') && d.innerText.includes('成功 1') && d.innerText.includes('跳过 2') && d.innerText.includes('第 2 行：非法 JSON 行或非对象') && d.innerText.includes('第 3 行：schema 校验失败') && d.innerText.includes('好行'); })()`,
      'v2 drawer with errors',
    );
    await evaluate(`document.querySelector('.ant-drawer-open .ant-drawer-close').click(); true`);
    await waitFor(`!document.querySelector('.ant-drawer-open')`, 'drawer closed');
  });

  await step('解析失败版本（API 造 .csv 对象）：详情显示"解析失败"，抽屉显示失败原因', async () => {
    const pre = (
      await api('/api/dataset/getUploadPreSignedUrl', { fileName: 'bad.csv' }, userToken)
    ).data;
    const put = await fetch(pre.uploadUrl, { method: 'PUT', body: 'a,b\n1,2\n' });
    if (put.status !== 200) throw new Error(`PUT csv ${put.status}`);
    await api(
      '/api/dataset/createDatasetVersion',
      { datasetId, ossPath: pre.objectKey, versionDesc: '错误文件' },
      userToken,
    );
    await reloadDetailUntil(datasetId, '解析失败');
    await waitFor(
      `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes('v3') && r.innerText.includes('解析失败') && r.innerText.includes('—'))`,
      'v3 failed row',
    );
    await clickRowAction('v3', '预览样本');
    await waitFor(
      `(() => { const d = document.querySelector('.ant-drawer-open'); return !!d && d.innerText.includes('失败原因：不支持的文件类型') && d.innerText.includes('暂无样本'); })()`,
      'v3 drawer failure reason',
    );
  });

  await step('列表搜索：关键字回车过滤到 1 行；最新版本 v3', async () => {
    await navigate('/dataset');
    await waitForText(DATASET.name);
    await evaluate(`(() => {
      const input = document.querySelector('.ant-input[placeholder]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(DATASET.desc)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      return true;
    })()`);
    await waitFor(
      `document.querySelectorAll('.ant-table-row').length === 1 && document.querySelector('.ant-table-row').innerText.includes('v3')`,
      'filtered list',
    );
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
        created: { user: USER.username, workspace: WS.spaceCode, tool: TOOL.code, datasetId },
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
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(exitCode);
}
