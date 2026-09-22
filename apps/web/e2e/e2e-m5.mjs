// M5 浏览器验收：无头 Chrome + CDP 驱动真实前端（Vite 5173 → 后端 8080）。
// 覆盖 M5 新增能力：
//   1) 站内通知：标注员登录后顶栏铃铛有未读角标 → 通知中心看到「派发」通知 → 查看跳任务组 → 角标减少；
//   2) 截止时间：case 详情显示截止；定时扫描在 24h 内发出「将于 … 截止」通知给创建人（等 ≤ 90s）；
//   3) 暂停 / 恢复：暂停后标注员提交不补题；恢复后补题；
//   4) 用户禁用 / 启用：用户管理点「禁用」→ 确认 → 该用户登录 USER_DISABLED、旧 token 401；「启用」后恢复；
//   5) 结束任务：确认后状态「已结束」、操作按钮消失、标注员提交被拒（CASE_FINISHED）。
// 无第三方依赖（Node ≥ 22）。用法：node e2e/e2e-m5.mjs [baseUrl] [apiBase] [browserExe]
import { ADMIN, createSteps, dumpFailure, launch, makeApi, sleep } from './lib/cdp.mjs';

const baseUrl = process.argv[2] ?? 'http://localhost:5173';
const apiBase = process.argv[3] ?? 'http://127.0.0.1:8080';
const browserExe = process.argv[4];
const api = makeApi(apiBase);

const stamp = Date.now().toString(36).slice(-5);
const LA = { username: `e5a${stamp}`, displayName: `验收管理员${stamp}`, password: 'e2epass1' };
const LB = { username: `e5l${stamp}`, displayName: `验收标注员${stamp}`, password: 'e2epass1' };
const WS = { spaceCode: `e2e-m5-${stamp}`, name: `验收空间M5${stamp}` };
const TOOL = { code: `e2e-m5-tool-${stamp}`, name: `验收内置工具${stamp}` };
const DATASET = { name: `验收数据集M5${stamp}` };
const CASE = { name: `验收任务M5${stamp}` };
const SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: { content: { type: 'string' }, bizId: { type: 'string' } },
  required: ['content'],
};
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
    ],
  },
};
const JSONL = Array.from(
  { length: 5 },
  (_, i) => JSON.stringify({ content: `第 ${i + 1} 条样本`, bizId: `e${i + 1}` }) + '\n',
).join('');

/** 直接调后端但不因 success=false 抛错（验证被拒场景用）。 */
async function rawApi(path, body, token) {
  const res = await fetch(apiBase + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

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
    await api('/api/dataset/getUploadPreSignedUrl', { fileName: 'e2e-m5.jsonl' }, laToken)
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
    if (v.uploadStatus === 2 && v.sampleCount === 5) {
      versionId = v.versionId;
      break;
    }
    if (v.uploadStatus === 3) throw new Error('dataset parse failed');
    await sleep(300);
  }
  if (!versionId) throw new Error('dataset not ready');
  // 截止时间：2 小时后 → 在 24h 提醒窗口内，定时扫描会发「将于 … 截止」。
  const deadline = Date.now() + 2 * 3600 * 1000;
  const caseId = (
    await api(
      '/api/case/createCase',
      {
        spaceCode: WS.spaceCode,
        name: CASE.name,
        description: 'M5 浏览器验收',
        dataSourceType: 1,
        datasetVersionId: versionId,
        labelTool: TOOL.code,
        taskPlanConfig: { stages: [{ stage: 2, type: 'label' }] },
        assignmentConfig: {
          label: {
            strategy: 1,
            preDispatchSize: 2,
            autoRecycleMinutes: 30,
            members: [{ username: LB.username, ratio: null, active: true }],
          },
        },
        deadline,
      },
      laToken,
    )
  ).data.caseId;
  const lbToken = (await api('/api/auth/login', { username: LB.username, password: LB.password }))
    .data.token;
  const group = (
    await api('/api/taskgroup/getMyTaskGroups', { pageNum: 1, pageSize: 50 }, lbToken)
  ).data.find((g) => g.caseName === CASE.name);
  if (!group) throw new Error('labeler group not found');
  const tasksIn = async (status) =>
    (
      await api(
        '/api/task/getTaskListInGroup',
        { taskGroupId: group.taskGroupId, status, pageNum: 1, pageSize: 50 },
        lbToken,
      )
    ).data;

  page = await launch({ baseUrl, browserExe });
  const {
    evaluate,
    waitFor,
    waitForText,
    waitForToast,
    navigate,
    clickByText,
    clickRowAction,
    login,
  } = page;
  const bellUnread = () =>
    evaluate(
      `Number(document.querySelector('[data-testid="notification-bell"]')?.dataset.unread ?? -1)`,
    );
  const clickModalOk = async (text) => {
    await waitFor(`!!document.querySelector('.ant-modal-confirm, .ant-modal')`, 'modal', 5000);
    await clickByText('.ant-modal-confirm, .ant-modal', text, 'button');
  };

  await steps.run(
    '标注员登录 → 顶栏铃铛有未读 → 通知中心「派发」→ 查看跳任务组 → 角标减少',
    async () => {
      await login(LB.username, LB.password, '/my-groups');
      await waitFor(
        `${`Number(document.querySelector('[data-testid="notification-bell"]')?.dataset.unread ?? -1)`} >= 1`,
        'bell unread',
        15000,
      );
      const before = await bellUnread();
      await evaluate(`document.querySelector('[data-testid="notification-bell"]').click(); true`);
      await waitFor(`location.pathname === '/notifications'`, 'notifications route');
      await waitForText('派发了 2 条标注任务');
      await waitFor(
        `!!document.querySelector('[data-testid="notification-row"][data-read="false"]')`,
        'unread row',
      );
      await clickRowAction('派发了 2 条标注任务', '查看');
      await waitFor(
        `location.pathname === '/groups/${group.taskGroupId}'`,
        'group detail via notification',
      );
      await waitFor(`document.querySelectorAll('.ant-table-row').length > 0`, 'group tasks');
      // 角标：标记已读后减少（轮询 30s，但标记已读会让查询失效重拉）
      await waitFor(
        `${`Number(document.querySelector('[data-testid="notification-bell"]')?.dataset.unread ?? -1)`} === ${before - 1}`,
        'bell decreased',
        15000,
      );
      // 返回通知中心：该条已读
      await navigate('/notifications');
      await waitFor(
        `!!document.querySelector('[data-testid="notification-row"][data-read="true"]')`,
        'read row',
      );
    },
  );

  await steps.run(
    '空间管理员 → case 详情显示截止时间 → 暂停任务 → 标注员提交不补题 → 恢复后补题',
    async () => {
      await login(LA.username, LA.password, '/dataset');
      await navigate(`/case/${caseId}`);
      await waitForText('流程进度');
      const dl = await evaluate(
        `document.querySelector('[data-testid="case-deadline"]')?.innerText ?? ''`,
      );
      if (!dl.includes('截止') || dl.includes('未设置')) throw new Error(`deadline text: ${dl}`);
      await clickByText(null, '暂停任务', 'button');
      await waitForToast('任务已暂停');
      await waitForText('已暂停');
      await waitFor(
        `[...document.querySelectorAll('button')].some(b => b.textContent.replace(/\\s+/g, '') === '恢复任务')`,
        'resume button',
      );
      // 标注员在暂停期间提交一条：在手 2 → 1，池内仍 3（不补题）
      const inHand = await tasksIn(2);
      if (inHand.length !== 2) throw new Error(`in-hand before ${inHand.length}`);
      await api(
        '/api/task/saveTaskResult',
        { taskId: inHand[0].taskId, sampleType: 1, result: { grade: '合格' } },
        lbToken,
      );
      await api('/api/task/submitLabelTask', { taskId: inHand[0].taskId }, lbToken);
      await sleep(1500);
      if ((await tasksIn(2)).length !== 1) throw new Error('paused case still dispatched');
      // 恢复 → 补到 2
      await clickByText(null, '恢复任务', 'button');
      await waitForToast('任务已恢复');
      await waitForText('运行中');
      const deadlineAt = Date.now() + 10000;
      let refilled = false;
      while (Date.now() < deadlineAt) {
        if ((await tasksIn(2)).length === 2) {
          refilled = true;
          break;
        }
        await sleep(300);
      }
      if (!refilled) throw new Error('resume did not refill');
    },
  );

  await steps.run(
    '截止扫描：创建人在 90s 内收到「将于 … 截止」通知（后端定时器每分钟一次）',
    async () => {
      const until = Date.now() + 90_000;
      let found = null;
      while (Date.now() < until) {
        const list = (
          await api('/api/notification/getNotificationList', { pageNum: 1, pageSize: 20 }, laToken)
        ).data;
        found = list.find((n) => n.type === 'CASE_DEADLINE' && n.refId === caseId);
        if (found) break;
        await sleep(3000);
      }
      if (!found) throw new Error('deadline reminder not received');
      if (!found.title.includes('将于')) throw new Error(`title ${found.title}`);
      await navigate('/notifications');
      await waitForText('将于');
    },
  );

  await steps.run('修改截止时间弹窗：打开 → 清除截止时间 → 显示「未设置」', async () => {
    await navigate(`/case/${caseId}`);
    await waitForText('流程进度');
    await clickByText('[data-testid="case-deadline"]', '修改', 'a');
    await waitFor(`!!document.querySelector('.ant-modal .ant-picker')`, 'deadline modal');
    await clickModalOk('清除截止时间');
    await waitForToast('已清除截止时间');
    await waitFor(
      `(document.querySelector('[data-testid="case-deadline"]')?.innerText ?? '').includes('未设置')`,
      'deadline cleared',
    );
    const d = (await api('/api/case/getCaseDetail', { caseId }, laToken)).data;
    if (d.ext?.deadline != null) throw new Error('deadline still set in API');
  });

  await steps.run(
    '系统管理员 → 用户管理「禁用」标注员 → 登录被拒 / 旧 token 401 → 「启用」恢复',
    async () => {
      await login(ADMIN.username, ADMIN.password, '/dataset');
      await navigate('/user');
      await waitFor(
        `!!document.querySelector('input[placeholder="搜索用户名 / 显示名"]')`,
        'user search',
      );
      // 关键字受控且进 queryKey：输入即触发查询。
      await page.fillByPlaceholder('搜索用户名 / 显示名', LB.username);
      await waitFor(
        `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes(${JSON.stringify(LB.username)}))`,
        'user row',
      );
      await clickRowAction(LB.username, '禁用');
      await clickModalOk('禁 用');
      await waitForToast('已禁用该用户');
      await waitFor(
        `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes(${JSON.stringify(LB.username)}) && r.innerText.includes('禁用') && r.innerText.includes('启用'))`,
        'row disabled',
      );
      const denied = await rawApi('/api/auth/login', {
        username: LB.username,
        password: LB.password,
      });
      if (denied.json.code !== 'USER_DISABLED') throw new Error(`login code ${denied.json.code}`);
      const old = await rawApi('/api/taskgroup/getMyTaskGroups', { pageSize: 1 }, lbToken);
      if (old.status !== 401) throw new Error(`old token status ${old.status}`);
      await clickRowAction(LB.username, '启用');
      await waitForToast('已启用该用户');
      const ok = await rawApi('/api/auth/login', { username: LB.username, password: LB.password });
      if (!ok.json.success)
        throw new Error(`re-login failed ${JSON.stringify(ok.json).slice(0, 200)}`);
    },
  );

  await steps.run(
    '空间管理员 → 结束任务（确认）→ 「已结束」且操作消失 → 标注员提交 CASE_FINISHED',
    async () => {
      await login(LA.username, LA.password, '/dataset');
      await navigate(`/case/${caseId}`);
      await waitForText('流程进度');
      await clickByText(null, '结束任务', 'button');
      await clickModalOk('结束任务');
      await waitForToast('任务已结束');
      await waitForText('已结束');
      await waitFor(
        `![...document.querySelectorAll('button')].some(b => /暂停任务|恢复任务|结束任务/.test(b.textContent.replace(/\\s+/g, '')))`,
        'controls hidden',
      );
      const lbToken2 = (
        await api('/api/auth/login', { username: LB.username, password: LB.password })
      ).data.token;
      const inHand = (
        await api(
          '/api/task/getTaskListInGroup',
          { taskGroupId: group.taskGroupId, status: 2, pageNum: 1, pageSize: 50 },
          lbToken2,
        )
      ).data;
      const r = await rawApi('/api/task/submitLabelTask', { taskId: inHand[0].taskId }, lbToken2);
      if (r.json.code !== 'CASE_FINISHED') throw new Error(`submit code ${r.json.code}`);
      // 列表页：已结束
      await navigate('/case');
      await waitFor(
        `[...document.querySelectorAll('.ant-table-row')].some(r => r.innerText.includes(${JSON.stringify(CASE.name)}) && r.innerText.includes('已结束'))`,
        'case list finished',
      );
    },
  );

  exitCode = 0;
} catch (err) {
  console.error('E2E FAILED:', err.message);
  if (page) await dumpFailure(page, 'e2e-m5');
} finally {
  steps.report('M5 E2E');
  if (page?.consoleErrors.length) console.log('console errors:', page.consoleErrors.slice(0, 10));
  if (page) await page.close();
  process.exit(exitCode);
}
