// M3 浏览器验收：本机 Chrome 无头 + CDP 驱动真实前端（Vite 5173 → 后端 8080）。
// 流程：API 造主数据（空间 / 四类成员 / IFRAME 工具指向内置示范页 /external/sentiment / 数据集 3 条）
//   → 空间管理员登录 → 新建标注任务（人工标注 → 人工初检，先到先得）→ 列表 → 详情进度
//   → 标注员登录 → 我的任务组 → 进入标注（iframe 内点「积极」自动保存）→ 提交标注
//   → 审核员登录 → 进入质检（iframe 只读显示「积极」）→ 填意见「不通过」
//   → 标注员再登录 → 任务变「重新标注」、第 2 轮、打回原因横幅 → 改「非积极」→ 提交
//   → 审核员再登录 → 第 2 轮质检「通过」
//   → 空间管理员 → 详情进度 → 结果导出 CSV → 「下载结果」链接可下载且内容正确。
// 无第三方依赖（Node ≥ 22）。用法：node e2e-m3.mjs [baseUrl] [apiBase] [browserExe]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
const LA = { username: `e3a${stamp}`, displayName: `验收管理员${stamp}`, password: 'e2epass1' };
const LB = { username: `e3l${stamp}`, displayName: `验收标注员${stamp}`, password: 'e2epass1' };
const RV = { username: `e3r${stamp}`, displayName: `验收审核员${stamp}`, password: 'e2epass1' };
const WS = { spaceCode: `e2e-m3-${stamp}`, name: `验收空间M3${stamp}` };
const TOOL = {
  code: `e2e-m3-tool-${stamp}`,
  name: `验收情绪工具${stamp}`,
  url: `${baseUrl}/external/sentiment`,
};
const DATASET = { name: `验收数据集M3${stamp}` };
const CASE = { name: `验收任务M3${stamp}` };
const SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: { content: { type: 'string' }, bizId: { type: 'string' } },
  required: ['content'],
};
const JSONL =
  '{"content":"服务很好，下次还来","bizId":"e1"}\n{"content":"等了很久，体验一般","bizId":"e2"}\n{"content":"物超所值","bizId":"e3"}\n';

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
/** 同源 iframe 内的文本。 */
const FRAME = `document.querySelector('iframe')?.contentDocument`;
const waitForFrameText = (text, timeoutMs) =>
  waitFor(
    `!!(${FRAME}) && (${FRAME}).body.innerText.includes(${JSON.stringify(text)})`,
    `iframe text "${text}"`,
    timeoutMs,
  );
async function navigate(path) {
  await evaluate('window.__toasts = []');
  await send(ws, 'Page.navigate', { url: `${baseUrl}${path}` }, sessionId);
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
  const ok = await evaluate(setValueExpr(`document.getElementById(${JSON.stringify(id)})`, value));
  if (ok !== 'ok') throw new Error(`fill #${id}: ${ok}`);
}
async function fillByPlaceholder(placeholder, value) {
  const ok = await evaluate(
    setValueExpr(
      `document.querySelector('input[placeholder=' + ${JSON.stringify(JSON.stringify(placeholder))} + '],textarea[placeholder=' + ${JSON.stringify(JSON.stringify(placeholder))} + ']')`,
      value,
    ),
  );
  if (ok !== 'ok') throw new Error(`fill "${placeholder}": ${ok}`);
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
/** 在 iframe 内按文本点按钮。 */
async function clickInFrame(text) {
  const ok = await evaluate(`(() => {
    const doc = ${FRAME};
    if (!doc) return 'no-frame';
    const want = ${JSON.stringify(text)}.replace(/\\s+/g, '');
    const norm = (t) => t.replace(/\s+/g, '');
    const el = [...doc.querySelectorAll('button')].find(e =>
      norm(e.textContent) === want || [...e.querySelectorAll('span')].some(s => norm(s.textContent) === want));
    if (!el) return 'no-el';
    if (el.disabled) return 'disabled';
    el.click();
    return 'ok';
  })()`);
  if (ok !== 'ok') throw new Error(`click "${text}" in iframe: ${ok}`);
}
/** 流程编排的阶段 chip：按钮内有多个子元素，按其中的标题 span 定位后点整个按钮。 */
async function toggleStage(label) {
  const ok = await evaluate(`(() => {
    const span = [...document.querySelectorAll('button span')].find(e => e.children.length === 0 && e.textContent.replace(/\s+/g, '') === ${JSON.stringify(label)}.replace(/\s+/g, ''));
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
  await waitFor(`location.pathname === ${JSON.stringify(expectedPath)}`, `landing ${expectedPath}`);
  await waitFor(`!!localStorage.getItem('lingshu.token')`, 'token stored');
}
/** 我的任务组 → 点开 caseName 对应、带某阶段标签的组。 */
async function openMyGroup(stageLabel) {
  await navigate('/my-groups');
  await waitFor(
    `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes(${JSON.stringify(CASE.name)}) && r.innerText.includes(${JSON.stringify(stageLabel)}))`,
    `group row ${stageLabel}`,
  );
  const ok = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.ant-table-row')].find(r => r.innerText.includes(${JSON.stringify(CASE.name)}) && r.innerText.includes(${JSON.stringify(stageLabel)}));
    const link = [...row.querySelectorAll('a,button,span')].find(e => e.textContent.replace(/\s+/g, '') === '进入');
    if (!link) return 'no-link';
    link.click();
    return 'ok';
  })()`);
  if (ok !== 'ok') throw new Error(`open group: ${ok}`);
  await waitFor(`/^\\/my-groups\\/\\d+$/.test(location.pathname)`, 'group detail');
  await waitFor(`document.querySelectorAll('.ant-table-row').length > 0`, 'group tasks');
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
let caseId;
try {
  // ---- API 造主数据 ----
  const adminToken = (await api('/api/auth/login', ADMIN)).data.token;
  const wsId = (await api('/api/workspace/createWorkspace', WS, adminToken)).data.workspaceId;
  const ids = {};
  for (const [k, u] of Object.entries({ la: LA, lb: LB, rv: RV }))
    ids[k] = (await api('/api/user/create', u, adminToken)).data.userId;
  await api(
    '/api/workspace/addWorkspaceMember',
    {
      workspaceId: wsId,
      members: [
        { userId: ids.la, roles: [3] },
        { userId: ids.lb, roles: [1] },
        { userId: ids.rv, roles: [2] },
      ],
    },
    adminToken,
  );
  await api(
    '/api/labeltool/createLabelTool',
    {
      labelToolCode: TOOL.code,
      labelToolName: TOOL.name,
      labelToolType: 2,
      labelToolUrl: TOOL.url,
      labelToolJsonSchema: SCHEMA,
      labelToolPageSchema: null,
    },
    adminToken,
  );
  const laToken = (await api('/api/auth/login', { username: LA.username, password: LA.password }))
    .data.token;
  const pre = (
    await api('/api/dataset/getUploadPreSignedUrl', { fileName: 'e2e-m3.jsonl' }, laToken)
  ).data;
  const put = await fetch(pre.uploadUrl, { method: 'PUT', body: JSONL });
  if (put.status !== 200) throw new Error(`PUT MinIO ${put.status}`);
  const ds = (
    await api(
      '/api/dataset/createDataset',
      {
        spaceCode: WS.spaceCode,
        datasetName: DATASET.name,
        labelToolCode: TOOL.code,
        ossPath: pre.objectKey,
      },
      laToken,
    )
  ).data;
  for (let i = 0; i < 60; i += 1) {
    const v = (await api('/api/dataset/getDatasetDetail', { datasetId: ds.datasetId }, laToken))
      .data.versions[0];
    if (v.uploadStatus === 2 && v.sampleCount === 3) break;
    if (v.uploadStatus === 3) throw new Error('dataset parse failed');
    await sleep(300);
  }

  const { webSocketDebuggerUrl } = await waitForDevtools();
  ws = await connect(webSocketDebuggerUrl);
  const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true }));
  await send(ws, 'Page.enable', {}, sessionId);
  await send(ws, 'Runtime.enable', {}, sessionId);
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

  await step('空间管理员登录 → 新建标注任务（关 AI 预标、开人工初检、选成员）', async () => {
    await login(LA.username, LA.password, '/dataset');
    await navigate('/case/new');
    await waitForText('流程编排');
    await fillByPlaceholder('如：门诊对话全流程标注', CASE.name);
    await pickSelect('form', 0, TOOL.name);
    await fillByPlaceholder('任务目标、场景与说明', 'M3 浏览器验收');
    await pickSelect('form', 1, DATASET.name);
    await pickSelect('form', 2, 'v1 · 已就绪');
    // 阶段 chip：默认 AI 预标 + 人工标注；改成 人工标注 + 人工初检
    await toggleStage('AI 预标');
    await toggleStage('人工初检');
    await waitFor(`document.body.innerText.includes('派发策略')`, 'human cards');
    await pickSelect('form', 3, `${LB.displayName}（${LB.username}）`);
    await pickSelect('form', 4, `${RV.displayName}（${RV.username}）`);
    await waitFor(
      `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.replace(/\\s+/g, '') === '创建任务'); return !!b && !b.disabled; })()`,
      'submit enabled',
    );
    await clickByText(null, '创建任务', 'button');
    await waitForToast('标注任务创建成功');
    await waitFor(`location.pathname === '/case'`, 'back to case list');
  });

  await step('任务列表：新任务「进行中」→ 详情：进度 人工标注 3 在做 / 人工初检 0', async () => {
    await waitFor(
      `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes(${JSON.stringify(CASE.name)}) && r.innerText.includes('运行中'))`,
      'case row',
    );
    await clickRowAction(CASE.name, '查看详情');
    await waitFor(`/^\\/case\\/\\d+$/.test(location.pathname)`, 'case detail');
    caseId = Number(await evaluate('location.pathname.split("/").pop()'));
    await waitForText('流程进度');
    await waitForText('结果导出');
    const d = (await api('/api/case/getCaseDetail', { caseId }, laToken)).data;
    if (!(d.stageProgress[0].personalDoing === 3 && d.stageProgress[1].done === 0))
      throw new Error(`progress ${JSON.stringify(d.stageProgress)}`);
    await waitFor(
      `document.body.innerText.includes('全流程已完成') && document.body.innerText.includes('0')`,
      'progress header',
    );
  });

  await step(
    '标注员登录 → 我的任务组 → 进入标注 → iframe 内点「积极」自动保存 → 提交标注',
    async () => {
      await login(LB.username, LB.password, '/my-groups');
      await openMyGroup('人工标注');
      await waitForText('e1');
      await clickRowAction('e1', '进入标注');
      await waitFor(`/^\\/exec\\/label\\/\\d+$/.test(location.pathname)`, 'label exec page');
      await waitForText('第 1 轮');
      await waitForFrameText('服务很好，下次还来', 20000);
      await clickInFrame('积极');
      await waitForFrameText('已保存草稿（积极）', 10000);
      await clickByText(null, '提交标注', 'button');
      await waitForToast('已提交标注');
      // 队列自动切到下一题（e2）
      await waitForFrameText('等了很久，体验一般', 20000);
    },
  );

  await step('审核员登录 → 进入质检（只读看到「积极」）→ 填意见 → 不通过', async () => {
    await login(RV.username, RV.password, '/my-groups');
    await openMyGroup('人工初检');
    await waitForText('e1');
    await clickRowAction('e1', '进入质检');
    await waitFor(`/^\\/exec\\/review\\/\\d+$/.test(location.pathname)`, 'review exec page');
    await waitForFrameText('积极', 20000);
    await fillByPlaceholder('可选填，如：第 2 轮对话角色标注错误', '这条其实是抱怨');
    await clickByText(null, '不通过', 'button');
    await waitForToast('已不通过');
  });

  await step(
    '标注员再登录 → 任务变「重新标注」第 2 轮、看到打回原因 → 改「非积极」→ 提交',
    async () => {
      await login(LB.username, LB.password, '/my-groups');
      await openMyGroup('人工标注');
      await waitFor(
        `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes('e1') && r.innerText.includes('打回重标'))`,
        'rework row',
      );
      await clickRowAction('e1', '重新标注');
      await waitFor(`/^\\/exec\\/label\\/\\d+$/.test(location.pathname)`, 'label exec page');
      await waitForText('第 2 轮');
      await waitForText('这条其实是抱怨');
      await waitForFrameText('服务很好，下次还来', 20000);
      await clickInFrame('非积极');
      await waitForFrameText('已保存草稿（非积极）', 10000);
      await clickByText(null, '提交标注', 'button');
      await waitForToast('已提交标注');
    },
  );

  await step('审核员再登录 → 第 2 轮质检（只读「非积极」）→ 通过', async () => {
    await login(RV.username, RV.password, '/my-groups');
    await openMyGroup('人工初检');
    await waitFor(
      `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes('e1') && r.innerText.includes('2'))`,
      'review round 2 row',
    );
    await clickRowAction('e1', '进入质检');
    await waitFor(`/^\\/exec\\/review\\/\\d+$/.test(location.pathname)`, 'review exec page');
    await waitForText('第 2 轮');
    await waitForFrameText('非积极', 20000);
    await clickByText(null, '通过', 'button');
    await waitForToast('已通过');
  });

  await step(
    '空间管理员 → 详情进度（初检完成 1）→ 导出 CSV → 「下载结果」链接内容正确',
    async () => {
      await login(LA.username, LA.password, '/dataset');
      await navigate(`/case/${caseId}`);
      await waitForText('结果导出');
      const d = (await api('/api/case/getCaseDetail', { caseId }, laToken)).data;
      if (!(d.stageProgress[1].done === 1 && d.stageProgress[0].done === 1))
        throw new Error(`progress ${JSON.stringify(d.stageProgress)}`);
      await clickByText(null, '导出结果', 'button');
      await waitForText('下载结果', 30000);
      const href = await evaluate(`document.querySelector('a[download]')?.href`);
      if (!href || !href.includes('X-Amz-Signature=')) throw new Error(`bad download href ${href}`);
      const csv = await (await fetch(href)).text();
      const lines = csv.split('\n').filter(Boolean);
      if (lines.length !== 4) throw new Error(`csv lines ${lines.length}`);
      if (
        !lines[1].includes('""sentiment"":""negative""') ||
        !lines[1].includes('""reviewAction"":1')
      )
        throw new Error(`csv row1 ${lines[1].slice(0, 300)}`);
      await waitForText('上次导出于');
    },
  );

  exitCode = 0;
} catch (err) {
  console.error('E2E FAILED:', err.message);
  try {
    const png = await send(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(tmpdir(), 'lingshu-e2e-m3-fail.png'), Buffer.from(png.data, 'base64'));
    console.error('screenshot:', join(tmpdir(), 'lingshu-e2e-m3-fail.png'));
  } catch {
    /* ignore */
  }
  try {
    console.error('URL:', await evaluate('location.href'));
    console.error('BODY:', (await evaluate('document.body.innerText')).slice(0, 1500));
  } catch {
    /* ignore */
  }
} finally {
  console.table(steps);
  if (consoleErrors.length) console.log('console errors:', consoleErrors.slice(0, 10));
  console.log(exitCode === 0 ? `ALL ${steps.length} E2E STEPS PASSED` : 'E2E FAILED');
  try {
    ws?.close();
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
  process.exit(exitCode);
}
