// M4 浏览器验收：无头 Chrome + CDP 驱动真实前端（Vite 5173 → 后端 8080）。
// 覆盖 M4 新增的前端能力：
//   1) 路由懒加载：登录后各页面正常打开（Suspense 无白屏）；
//   2) 内置 Puck 工具执行页：iframe 内改分段单选 / 文本 → 不点保存也自动落库（debounce）；
//   3) 提交前客户端校验：必填未填 → toast「请先填写：…」且不切题；补齐后提交成功；
//   4) 离线状态条：CDP 断网 → 顶部出现「网络已断开」；恢复 → 「网络已恢复」后消失；
//   5) 数据集详情解析中轮询：新建版本后不刷新页面自动变「已就绪」；
//   6) 前端性能页：系统管理员菜单出现「前端性能」，页面可打开（无样本为空态或有汇总）。
// 无第三方依赖（Node ≥ 22）。用法：node e2e/e2e-m4.mjs [baseUrl] [apiBase] [browserExe]
import { ADMIN, createSteps, dumpFailure, launch, makeApi, sleep } from './lib/cdp.mjs';

const baseUrl = process.argv[2] ?? 'http://localhost:5173';
const apiBase = process.argv[3] ?? 'http://127.0.0.1:8080';
const browserExe = process.argv[4];
const api = makeApi(apiBase);

const stamp = Date.now().toString(36).slice(-5);
const LA = { username: `e4a${stamp}`, displayName: `验收管理员${stamp}`, password: 'e2epass1' };
const LB = { username: `e4l${stamp}`, displayName: `验收标注员${stamp}`, password: 'e2epass1' };
const WS = { spaceCode: `e2e-m4-${stamp}`, name: `验收空间M4${stamp}` };
const TOOL = { code: `e2e-m4-tool-${stamp}`, name: `验收内置工具${stamp}` };
const DATASET = { name: `验收数据集M4${stamp}` };
const CASE = { name: `验收任务M4${stamp}` };
const SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: { content: { type: 'string' }, bizId: { type: 'string' } },
  required: ['content'],
};
// 内置工具 pageSchema（Puck Data）：单栏；文本展示 + 分段单选(grade) + 文本输入(reason，必填) + 保存按钮。
const PAGE_SCHEMA = {
  root: { props: { layout: 'single', leftWidth: '50%' } },
  content: [],
  zones: {
    'root:col1': [
      {
        type: 'TextView',
        props: { id: 'tv-1', label: '内容', showLabel: true, sampleField: 'content', minHeight: 0 },
      },
      {
        type: 'SegmentInput',
        props: {
          id: 'seg-1',
          label: '评级',
          resultKey: 'grade',
          options: [{ label: '优秀' }, { label: '合格' }, { label: '不合格' }],
        },
      },
      {
        type: 'TextInput',
        props: {
          id: 'ti-1',
          label: '理由',
          resultKey: 'reason',
          placeholder: '请输入理由',
          multiline: false,
          rows: 3,
          maxLength: 0,
          showCount: false,
          minHeight: 0,
        },
      },
      {
        type: 'SaveResultButton',
        props: { id: 'sb-1', text: '保存标注结果', align: 'right', block: false },
      },
    ],
  },
};
const JSONL =
  '{"content":"服务很好，下次还来","bizId":"e1"}\n' +
  '{"content":"等了很久，体验一般","bizId":"e2"}\n' +
  '{"content":"物超所值","bizId":"e3"}\n';

const steps = createSteps();
let page;
let exitCode = 1;
try {
  // ---- API 造主数据 ----
  const adminToken = (await api('/api/auth/login', ADMIN)).data.token;
  const wsId = (await api('/api/workspace/createWorkspace', WS, adminToken)).data.workspaceId;
  const laId = (await api('/api/user/create', LA, adminToken)).data.userId;
  const lbId = (await api('/api/user/create', LB, adminToken)).data.userId;
  await api(
    '/api/workspace/addWorkspaceMember',
    {
      workspaceId: wsId,
      members: [
        { userId: laId, roles: [3] },
        { userId: lbId, roles: [1] },
      ],
    },
    adminToken,
  );
  await api(
    '/api/labeltool/createLabelTool',
    {
      labelToolCode: TOOL.code,
      labelToolName: TOOL.name,
      labelToolType: 1,
      labelToolUrl: '',
      labelToolJsonSchema: SCHEMA,
      labelToolPageSchema: PAGE_SCHEMA,
    },
    adminToken,
  );
  const laToken = (await api('/api/auth/login', { username: LA.username, password: LA.password }))
    .data.token;
  const pre = (
    await api('/api/dataset/getUploadPreSignedUrl', { fileName: 'e2e-m4.jsonl' }, laToken)
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
  let versionId;
  for (let i = 0; i < 60; i += 1) {
    const v = (await api('/api/dataset/getDatasetDetail', { datasetId: ds.datasetId }, laToken))
      .data.versions[0];
    if (v.uploadStatus === 2 && v.sampleCount === 3) {
      versionId = v.versionId;
      break;
    }
    if (v.uploadStatus === 3) throw new Error('dataset parse failed');
    await sleep(300);
  }
  if (!versionId) throw new Error('dataset not ready');
  const human = (names) => ({
    strategy: 1,
    preDispatchSize: 3,
    autoRecycleMinutes: 30,
    members: names.map((username) => ({ username, ratio: null, active: true })),
  });
  await api(
    '/api/case/createCase',
    {
      spaceCode: WS.spaceCode,
      name: CASE.name,
      description: 'M4 浏览器验收',
      dataSourceType: 1,
      datasetVersionId: versionId,
      labelTool: TOOL.code,
      taskPlanConfig: { stages: [{ stage: 2, type: 'label' }] },
      assignmentConfig: { label: human([LB.username]) },
    },
    laToken,
  );
  const lbToken = (await api('/api/auth/login', { username: LB.username, password: LB.password }))
    .data.token;
  const groups = (
    await api('/api/taskgroup/getMyTaskGroups', { pageNum: 1, pageSize: 50 }, lbToken)
  ).data;
  const group = groups.find((g) => g.caseName === CASE.name);
  if (!group) throw new Error('labeler group not found');
  const tasks = (
    await api(
      '/api/task/getTaskListInGroup',
      { taskGroupId: group.taskGroupId, pageNum: 1, pageSize: 50 },
      lbToken,
    )
  ).data;
  const taskE1 = tasks.find((t) => t.bizId === 'e1');
  if (!taskE1) throw new Error('task e1 not found');

  page = await launch({ baseUrl, browserExe });
  const {
    evaluate,
    waitFor,
    waitForText,
    waitForToast,
    waitForFrameText,
    FRAME,
    navigate,
    clickByText,
    clickInFrame,
    fillByPlaceholder,
    clickRowAction,
    login,
    openMyGroup,
    setOffline,
  } = page;

  await steps.run('系统管理员登录 → 侧栏有「前端性能」→ 页面可打开（懒加载）', async () => {
    await login(ADMIN.username, ADMIN.password, '/dataset');
    await waitForText('前端性能');
    await clickByText(null, '前端性能', 'a,span,div,li');
    await waitFor(`location.pathname === '/monitoring/web-vitals'`, 'web vitals route');
    await waitFor(
      `document.body.innerText.includes('没有性能样本') || document.body.innerText.includes('按天趋势')`,
      'web vitals page rendered',
      20000,
    );
    // 其余懒加载页面逐个打开不白屏。
    for (const [path, text] of [
      ['/workspace', WS.name],
      ['/user', LA.username],
      ['/labeltool', TOOL.name],
      ['/task-progress', '任务组'],
    ]) {
      await navigate(path);
      await waitForText(text, 20000);
    }
  });

  await steps.run('标注员进入内置工具执行页 → 改评级 / 填理由 → 不点保存自动落库', async () => {
    await login(LB.username, LB.password, '/my-groups');
    await openMyGroup(CASE.name, '人工标注');
    await waitForText('e1');
    await clickRowAction('e1', '进入标注');
    await waitFor(`/^\\/exec\\/label\\/\\d+$/.test(location.pathname)`, 'label exec page');
    await waitForFrameText('服务很好，下次还来', 20000);
    // SegmentInput 挂载后会把首项写入 result 并触发自动保存；这里显式改成「合格」。
    await clickInFrame('合格');
    await fillByPlaceholder('请输入理由', '性价比一般', FRAME);
    // 等 debounce（600ms）+ 请求落库。
    const deadline = Date.now() + 8000;
    let saved = null;
    while (Date.now() < deadline) {
      const r = (
        await api('/api/task/getTaskResult', { taskId: taskE1.taskId, sampleType: 1 }, lbToken)
      ).data;
      if (r.hasResult && r.result?.grade === '合格' && r.result?.reason === '性价比一般') {
        saved = r.result;
        break;
      }
      await sleep(300);
    }
    if (!saved) throw new Error('auto-save did not persist grade/reason');
  });

  await steps.run(
    '提交前客户端校验：清空理由 → 提交被拦（toast）→ 补齐后提交成功并切题',
    async () => {
      await fillByPlaceholder('请输入理由', '', FRAME);
      await sleep(1200); // 等自动保存把空值落库
      await clickByText(null, '提交标注', 'button');
      await waitForToast('请先填写：reason');
      await waitFor(
        `/^\\/exec\\/label\\/${taskE1.taskId}$/.test(location.pathname)`,
        'still on e1',
      );
      await fillByPlaceholder('请输入理由', '补上理由', FRAME);
      await sleep(1200);
      await clickByText(null, '提交标注', 'button');
      await waitForToast('已提交标注');
      await waitForFrameText('等了很久，体验一般', 20000);
      const d = (await api('/api/task/getTaskDetail', { taskId: taskE1.taskId }, lbToken)).data;
      if (d.status !== 4) throw new Error(`task e1 status ${d.status}`);
    },
  );

  await steps.run('断网：顶部出现「网络已断开」；恢复：「网络已恢复」并在 3s 后消失', async () => {
    await setOffline(true);
    await evaluate(`window.dispatchEvent(new Event('offline')); true`);
    await waitFor(
      `!!document.querySelector('[data-testid="network-status-bar"][data-state="offline"]')`,
      'offline bar',
      5000,
    );
    await waitForText('网络已断开');
    await setOffline(false);
    await evaluate(`window.dispatchEvent(new Event('online')); true`);
    await waitFor(
      `!!document.querySelector('[data-testid="network-status-bar"][data-state="recovered"]')`,
      'recovered bar',
      5000,
    );
    await waitFor(
      `!document.querySelector('[data-testid="network-status-bar"]')`,
      'bar hidden',
      6000,
    );
  });

  await steps.run('数据集详情：进入时版本「解析中」→ 不刷新页面自动轮询到就绪', async () => {
    await login(LA.username, LA.password, '/dataset');
    // 用 API 建一个较大的 v2（6000 行）让解析持续 1–3 秒，进入详情页时能看到「解析中」。
    const big = Array.from(
      { length: 6000 },
      (_, i) => JSON.stringify({ content: `第 ${i} 条样本内容`, bizId: `b${i}` }) + '\n',
    ).join('');
    const pre2 = (
      await api('/api/dataset/getUploadPreSignedUrl', { fileName: 'e2e-m4-v2.jsonl' }, laToken)
    ).data;
    await fetch(pre2.uploadUrl, { method: 'PUT', body: big });
    await api(
      '/api/dataset/createDatasetVersion',
      { datasetId: ds.datasetId, ossPath: pre2.objectKey, versionDesc: '第二版' },
      laToken,
    );
    await navigate(`/dataset/${ds.datasetId}`);
    const v2Row = `[...document.querySelectorAll('.ant-table-row')].find(r => r.innerText.includes('v2'))`;
    await waitFor(`!!${v2Row}`, 'v2 row', 15000);
    const initial = await evaluate(`(${v2Row}).innerText`);
    const sawParsing = initial.includes('解析中');
    // 不刷新页面：靠 refetchInterval 轮询到就绪 + 样本数 6000。
    await waitFor(
      `(() => { const r = ${v2Row}; return !!r && r.innerText.includes('就绪') && /(^|\\D)6000(\\D|$)/.test(r.innerText); })()`,
      'v2 ready via polling',
      60000,
    );
    console.log(
      sawParsing ? '  (观察到「解析中」→ 就绪的自动切换)' : '  (进入时已就绪，未观察到解析中态)',
    );
  });

  exitCode = 0;
} catch (err) {
  console.error('E2E FAILED:', err.message);
  if (page) await dumpFailure(page, 'e2e-m4');
} finally {
  steps.report('M4 E2E');
  if (page?.consoleErrors.length) console.log('console errors:', page.consoleErrors.slice(0, 10));
  if (page) await page.close();
  process.exit(exitCode);
}
