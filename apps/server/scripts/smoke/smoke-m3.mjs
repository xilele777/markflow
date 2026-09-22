// M3 接口级冒烟：对运行中的后端（默认 8080）跑通 case / task / taskgroup 接口 + 派发 + 审核驳回重标 + AI 预标预审（本地假 LLM）+ 导出。
// 用法：node smoke-m3.mjs [baseUrl]
import { createServer } from 'node:http';

const base = process.argv[2] ?? 'http://127.0.0.1:8080';
const stamp = Date.now().toString(36).slice(-5);
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(name, path, body, token, expect) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json();
  const ok = expect(res.status, json);
  results.push({ name, status: res.status, code: json.code, ok });
  if (!ok) console.log('  !! unexpected:', name, res.status, JSON.stringify(json).slice(0, 400));
  return json;
}
function check(name, ok, detail) {
  results.push({ name, status: '-', code: '-', ok });
  if (!ok) console.log('  !! unexpected:', name, detail ?? '');
}
const login = async (username, password) =>
  (
    await call(
      `login ${username}`,
      '/api/auth/login',
      { username, password },
      null,
      (s, j) => s === 200 && j.success,
    )
  ).data?.token;
async function waitFor(fn, pred, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (pred(v)) return v;
    if (Date.now() > deadline)
      throw new Error(`timeout: ${label}; last=${JSON.stringify(v).slice(0, 300)}`);
    await sleep(300);
  }
}
const detailOf = async (token, caseId) =>
  (await call('getCaseDetail', '/api/case/getCaseDetail', { caseId }, token, (s, j) => j.success))
    .data;
const myGroup = async (token, caseId, taskType) => {
  const j = await call(
    'getMyTaskGroups',
    '/api/taskgroup/getMyTaskGroups',
    { pageSize: 100 },
    token,
    (s, jj) => jj.success,
  );
  return j.data.find((g) => g.caseId === caseId && g.taskType === taskType);
};
const tasksIn = async (token, taskGroupId, status) =>
  (
    await call(
      'getTaskListInGroup',
      '/api/task/getTaskListInGroup',
      { taskGroupId, status, pageSize: 100 },
      token,
      (s, j) => j.success,
    )
  ).data;
async function waitMyTask(token, caseId, taskType, status, label) {
  return waitFor(
    async () => {
      const g = await myGroup(token, caseId, taskType);
      if (!g) return null;
      const list = await tasksIn(token, g.taskGroupId, status);
      return list.length ? { group: g, task: list[0] } : null;
    },
    (v) => v !== null,
    label,
  );
}

// ---- 本地假 OpenAI 兼容服务：预标回固定 JSON；预审按 labelResult.label 判通过 ----
const llmCalls = [];
const llm = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const parsed = JSON.parse(body);
    llmCalls.push({ url: req.url, auth: req.headers.authorization, model: parsed.model });
    const user = parsed.messages.find((m) => m.role === 'user')?.content ?? '';
    let content;
    if (user.includes('"labelResult"')) {
      const pass = JSON.parse(user).labelResult?.label !== 'bad';
      content = JSON.stringify({
        reviewAction: pass ? 1 : 0,
        reviewComment: pass ? 'AI 认为没问题' : 'AI 认为标错了',
      });
    } else {
      content =
        '```json\n' + JSON.stringify({ label: 'ai-pre', source: JSON.parse(user).text }) + '\n```';
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [{ message: { content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
  });
});
await new Promise((r) => llm.listen(0, '127.0.0.1', r));
const llmBase = `http://127.0.0.1:${llm.address().port}/v1`;

try {
  const admin = await login(
    process.env.LINGSHU_ADMIN_USERNAME ?? 'admin',
    process.env.LINGSHU_ADMIN_INITIAL_PASSWORD ?? 'admin123456',
  );

  // ---- 主数据 ----
  const spaceCode = `m3-ws-${stamp}`;
  const wsId = (
    await call(
      'createWorkspace',
      '/api/workspace/createWorkspace',
      { spaceCode, name: 'M3 冒烟空间' },
      admin,
      (s, j) => j.success,
    )
  ).data.workspaceId;
  const mk = async (prefix, displayName) => ({
    username: `${prefix}${stamp}`,
    password: 'pass123456',
    userId: (
      await call(
        `createUser ${prefix}`,
        '/api/user/create',
        { username: `${prefix}${stamp}`, displayName, password: 'pass123456' },
        admin,
        (s, j) => j.success,
      )
    ).data.userId,
  });
  const la = await mk('m3adm', 'M3 空间管理员');
  const l1 = await mk('m3la', 'M3 标注员一');
  const l2 = await mk('m3lb', 'M3 标注员二');
  const rv = await mk('m3rv', 'M3 审核员');
  await call(
    'addWorkspaceMember',
    '/api/workspace/addWorkspaceMember',
    {
      workspaceId: wsId,
      members: [
        { userId: la.userId, roles: [3] },
        { userId: l1.userId, roles: [1] },
        { userId: l2.userId, roles: [1] },
        { userId: rv.userId, roles: [2] },
      ],
    },
    admin,
    (s, j) => j.success && j.data.successCount === 4,
  );
  const toolCode = `m3-tool-${stamp}`;
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: { text: { type: 'string' }, bizId: { type: 'string' } },
    required: ['text'],
  };
  await call(
    'createLabelTool',
    '/api/labeltool/createLabelTool',
    {
      labelToolCode: toolCode,
      labelToolName: 'M3 冒烟工具',
      labelToolType: 1,
      labelToolJsonSchema: schema,
      labelToolPageSchema: null,
    },
    admin,
    (s, j) => j.success,
  );
  const aiCode = `m3-ai-${stamp}`;
  await call(
    'createAiConfig',
    '/api/aiconfig/createAiConfig',
    {
      aiCode,
      name: 'M3 假模型',
      labelToolCode: toolCode,
      baseUrl: llmBase,
      apiKey: 'sk-smoke',
      model: 'fake-1',
      prompt: '你是标注助手，只输出 JSON',
    },
    admin,
    (s, j) => j.success,
  );
  const labelAdmin = await login(la.username, la.password);
  const labeler1 = await login(l1.username, l1.password);
  const labeler2 = await login(l2.username, l2.password);
  const reviewer = await login(rv.username, rv.password);

  // 数据集：3 条样本
  const pre = await call(
    'presign',
    '/api/dataset/getUploadPreSignedUrl',
    { fileName: 'm3.jsonl' },
    labelAdmin,
    (s, j) => j.success,
  );
  const put = await fetch(pre.data.uploadUrl, {
    method: 'PUT',
    body: '{"text":"第一条","bizId":"b1"}\n{"text":"第二条","bizId":"b2"}\n{"text":"第三条","bizId":"b3"}\n',
  });
  check('PUT → MinIO', put.status === 200, `status ${put.status}`);
  const ds = await call(
    'createDataset',
    '/api/dataset/createDataset',
    {
      spaceCode,
      datasetName: 'M3 冒烟数据集',
      labelToolCode: toolCode,
      ossPath: pre.data.objectKey,
    },
    labelAdmin,
    (s, j) => j.success,
  );
  const versionId = ds.data.versionId;
  await waitFor(
    async () =>
      (
        await call(
          'getDatasetDetail',
          '/api/dataset/getDatasetDetail',
          { datasetId: ds.data.datasetId },
          labelAdmin,
          (s, j) => j.success,
        )
      ).data.versions[0],
    (v) => v.uploadStatus === 2 && v.sampleCount === 3,
    'dataset READY',
  );

  const human = (names, extra = {}) => ({
    strategy: 1,
    preDispatchSize: 2,
    autoRecycleMinutes: 30,
    members: names.map((username) => ({ username, ratio: null, active: true })),
    ...extra,
  });
  const bodyA = {
    spaceCode,
    name: `M3 人工链路 ${stamp}`,
    description: '冒烟',
    dataSourceType: 1,
    datasetVersionId: versionId,
    labelTool: toolCode,
    taskPlanConfig: {
      stages: [
        { stage: 2, type: 'label' },
        { stage: 4, type: 'review' },
      ],
    },
    assignmentConfig: { label: human([l1.username]), review: human([rv.username]) },
  };

  // ---- 1. createCase 校验 ----
  await call('createCase as labeler', '/api/case/createCase', bodyA, labeler1, (s) => s === 403);
  await call(
    'createCase STREAM',
    '/api/case/createCase',
    { ...bodyA, dataSourceType: 2 },
    labelAdmin,
    (s, j) => j.code === 'DATA_SOURCE_TYPE_INVALID',
  );
  await call(
    'createCase bad stage',
    '/api/case/createCase',
    { ...bodyA, taskPlanConfig: { stages: [{ stage: 4, type: 'review' }] } },
    labelAdmin,
    (s, j) => j.code === 'TASK_PLAN_INVALID',
  );
  await call(
    'createCase role mismatch',
    '/api/case/createCase',
    { ...bodyA, assignmentConfig: { label: human([rv.username]), review: human([rv.username]) } },
    labelAdmin,
    (s, j) => j.code === 'MEMBER_ROLE_MISMATCH',
  );
  await call(
    'createCase ratio invalid',
    '/api/case/createCase',
    {
      ...bodyA,
      assignmentConfig: {
        label: human([l1.username, l2.username], {
          strategy: 2,
          members: [
            { username: l1.username, ratio: 30, active: true },
            { username: l2.username, ratio: 30, active: true },
          ],
        }),
        review: human([rv.username]),
      },
    },
    labelAdmin,
    (s, j) => j.code === 'RATIO_INVALID',
  );

  // ---- 2. 人工链路：建 case → 派发 → 标注 → 审核驳回 → 重标 → 二轮审核通过 ----
  const caseA = (
    await call(
      'createCase A',
      '/api/case/createCase',
      bodyA,
      labelAdmin,
      (s, j) => j.success && typeof j.data.caseId === 'number',
    )
  ).data.caseId;
  await call(
    'createCase dup',
    '/api/case/createCase',
    bodyA,
    labelAdmin,
    (s, j) => j.code === 'CASE_NAME_EXISTS',
  );
  let d = await detailOf(labelAdmin, caseA);
  check(
    'detail A progress: label 2 在做 1 池待领',
    d.stageProgress[0].personalDoing === 2 &&
      d.stageProgress[0].poolPending === 1 &&
      d.stageProgress[1].done === 0,
    JSON.stringify(d.stageProgress),
  );
  await call(
    'getCaseList keyword',
    '/api/case/getCaseList',
    { spaceCode, keyword: '人工链路' },
    labeler1,
    (s, j) => j.success && j.total === 1 && j.data[0].caseId === caseA,
  );
  await call(
    'getCaseList outsider',
    '/api/case/getCaseList',
    { spaceCode },
    admin,
    (s, j) => j.success,
  );
  const gA = await myGroup(labeler1, caseA, 2);
  check(
    'labeler1 个人组',
    !!gA && gA.spaceCode === spaceCode && gA.labelTool === toolCode,
    JSON.stringify(gA),
  );
  const inHand = await tasksIn(labeler1, gA.taskGroupId, 2);
  check(
    '在手 2 条，bizId 已填',
    inHand.length === 2 && inHand[0].bizId === 'b1' && inHand[0].taskGroupSeq === 1,
    JSON.stringify(inHand),
  );
  const t1 = inHand[0].taskId;
  await call(
    'getTaskListInGroup as labeler2',
    '/api/task/getTaskListInGroup',
    { taskGroupId: gA.taskGroupId },
    labeler2,
    (s) => s === 403,
  );
  await call(
    'getTaskDetail',
    '/api/task/getTaskDetail',
    { taskId: t1 },
    labeler1,
    (s, j) =>
      j.success &&
      j.data.stageType === 'label' &&
      j.data.status === 2 &&
      j.data.bizId === 'b1' &&
      j.data.labelTool.labelToolCode === toolCode,
  );
  await call(
    'getTaskDetail as labeler2',
    '/api/task/getTaskDetail',
    { taskId: t1 },
    labeler2,
    (s) => s === 403,
  );
  await call(
    'getTaskDetail as labelAdmin',
    '/api/task/getTaskDetail',
    { taskId: t1 },
    labelAdmin,
    (s, j) => j.success,
  );
  await call(
    'getSampleData',
    '/api/task/getSampleData',
    { taskId: t1 },
    labeler1,
    (s, j) => j.success && j.data.sampleData.text === '第一条',
  );
  await call(
    'getTaskResult empty',
    '/api/task/getTaskResult',
    { taskId: t1, sampleType: 1 },
    labeler1,
    (s, j) => j.success && j.data.hasResult === false,
  );
  await call(
    'submitLabelTask no result',
    '/api/task/submitLabelTask',
    { taskId: t1 },
    labeler1,
    (s, j) => j.code === 'RESULT_SAMPLE_NOT_FOUND',
  );
  await call(
    'saveTaskResult as labeler2',
    '/api/task/saveTaskResult',
    { taskId: t1, sampleType: 1, result: { label: 'x' } },
    labeler2,
    (s) => s === 403,
  );
  await call(
    'saveTaskResult',
    '/api/task/saveTaskResult',
    { taskId: t1, sampleType: 1, result: { label: 'bad' } },
    labeler1,
    (s, j) => j.success,
  );
  await call(
    'getTaskResult',
    '/api/task/getTaskResult',
    { taskId: t1, sampleType: 1 },
    labeler1,
    (s, j) => j.success && j.data.hasResult && j.data.result.label === 'bad',
  );
  await call(
    'submitLabelTask',
    '/api/task/submitLabelTask',
    { taskId: t1 },
    labeler1,
    (s, j) => j.success,
  );
  await call(
    'submitLabelTask again',
    '/api/task/submitLabelTask',
    { taskId: t1 },
    labeler1,
    (s, j) => j.code === 'TASK_ALREADY_COMPLETED',
  );
  d = await detailOf(labelAdmin, caseA);
  check('结果集已生成', typeof d.labelResultDatasetVersionId === 'number', JSON.stringify(d));
  check(
    '提交后补题：label 在做 2 / 池 0 / 完成 1',
    d.stageProgress[0].personalDoing === 2 &&
      d.stageProgress[0].poolPending === 0 &&
      d.stageProgress[0].done === 1,
    JSON.stringify(d.stageProgress),
  );
  const r1 = await waitMyTask(reviewer, caseA, 4, 3, 'review task dispatched');
  check('审核任务派给审核员', r1.task.bizId === 'b1' && r1.task.round === 1, JSON.stringify(r1));
  await call(
    'submitReviewTask as labeler',
    '/api/task/submitReviewTask',
    { taskId: r1.task.taskId, reviewAction: 1 },
    labeler1,
    (s) => s === 403,
  );
  await call(
    'submitReviewTask bad action',
    '/api/task/submitReviewTask',
    { taskId: r1.task.taskId, reviewAction: 7 },
    reviewer,
    (s, j) => j.code === 'REVIEW_ACTION_INVALID',
  );
  await call(
    'getTaskResult label as reviewer',
    '/api/task/getTaskResult',
    { taskId: r1.task.taskId, sampleType: 1 },
    reviewer,
    (s, j) => j.success && j.data.result.label === 'bad',
  );
  await call(
    'submitReviewTask reject',
    '/api/task/submitReviewTask',
    { taskId: r1.task.taskId, reviewAction: 0, reviewComment: '标错了' },
    reviewer,
    (s, j) => j.success,
  );
  const rework = await tasksIn(labeler1, gA.taskGroupId, 5);
  check(
    '标注 task 打回：status 5 round 2',
    rework.length === 1 && rework[0].taskId === t1 && rework[0].round === 2,
    JSON.stringify(rework),
  );
  await call(
    'getTaskResult review comment',
    '/api/task/getTaskResult',
    { taskId: t1, sampleType: 2 },
    labeler1,
    (s, j) =>
      j.success && j.data.result.reviewAction === 0 && j.data.result.reviewComment === '标错了',
  );
  await call(
    'saveTaskResult fixed',
    '/api/task/saveTaskResult',
    { taskId: t1, sampleType: 1, result: { label: 'good' } },
    labeler1,
    (s, j) => j.success,
  );
  await call(
    'submitLabelTask rework',
    '/api/task/submitLabelTask',
    { taskId: t1 },
    labeler1,
    (s, j) => j.success,
  );
  const r1b = await waitFor(
    async () =>
      (await tasksIn(reviewer, r1.group.taskGroupId, 3)).find((t) => t.taskId === r1.task.taskId),
    (t) => t && t.round === 2,
    'review reopened round 2',
  );
  check('二轮质检任务 round 2', r1b.round === 2, JSON.stringify(r1b));
  await call(
    'submitReviewTask pass',
    '/api/task/submitReviewTask',
    { taskId: r1b.taskId, reviewAction: 1, reviewComment: '好了' },
    reviewer,
    (s, j) => j.success,
  );
  await sleep(500);
  d = await detailOf(labelAdmin, caseA);
  check('review 阶段完成 1', d.stageProgress[1].done === 1, JSON.stringify(d.stageProgress));
  await call(
    'getTaskGroupList as labelAdmin',
    '/api/taskgroup/getTaskGroupList',
    { caseId: caseA },
    labelAdmin,
    (s) => s === 403,
  );
  await call(
    'getTaskGroupList',
    '/api/taskgroup/getTaskGroupList',
    { caseId: caseA },
    admin,
    (s, j) => j.success && j.total === 4,
  );

  // ---- 3. 导出 ----
  await call(
    'export bad format',
    '/api/case/exportCaseResult',
    { caseId: caseA, format: 'xml' },
    labelAdmin,
    (s, j) => j.code === 'EXPORT_FORMAT_INVALID',
  );
  await call(
    'export as labeler',
    '/api/case/exportCaseResult',
    { caseId: caseA, format: 'csv' },
    labeler1,
    (s) => s === 403,
  );
  await call(
    'export csv',
    '/api/case/exportCaseResult',
    { caseId: caseA, format: 'csv' },
    labelAdmin,
    (s, j) => j.success,
  );
  d = await waitFor(
    () => detailOf(labelAdmin, caseA),
    (x) => x.ext?.lastExport?.status === 'DONE',
    'export DONE',
  );
  check(
    'lastExport DONE 带 downloadUrl / objectKey',
    typeof d.ext.lastExport.downloadUrl === 'string' &&
      /^export\/case\//.test(d.ext.lastExport.objectKey),
    JSON.stringify(d.ext),
  );
  const csv = await (await fetch(d.ext.lastExport.downloadUrl)).text();
  const lines = csv.split('\n').filter(Boolean);
  check(
    'CSV 表头 + 3 行；首行含标注 good 与质检通过',
    lines.length === 4 &&
      lines[0].includes('caseId,bizId,sourceSampleId') &&
      lines[1].includes('""label"":""good""') &&
      lines[1].includes('""reviewAction"":1'),
    lines.slice(0, 2).join(' | ').slice(0, 300),
  );

  // ---- 4. AI 链路：aiPreLabel → label → aiPreReview → review（真实 LLM 客户端打本地假服务）----
  const bodyB = {
    spaceCode,
    name: `M3 AI 链路 ${stamp}`,
    dataSourceType: 1,
    datasetVersionId: versionId,
    labelTool: toolCode,
    taskPlanConfig: {
      stages: [
        { stage: 1, type: 'aiPreLabel' },
        { stage: 2, type: 'label' },
        { stage: 3, type: 'aiPreReview' },
        { stage: 4, type: 'review' },
      ],
    },
    assignmentConfig: {
      aiPreLabel: { aiCode, preDispatchSize: 3, autoRecycleMinutes: 30 },
      label: human([l2.username], { preDispatchSize: 3 }),
      aiPreReview: { aiCode, preDispatchSize: 3, autoRecycleMinutes: 30 },
      review: human([rv.username]),
    },
  };
  await call(
    'createCase AI mismatch tool',
    '/api/case/createCase',
    {
      ...bodyB,
      name: 'x',
      assignmentConfig: {
        ...bodyB.assignmentConfig,
        aiPreLabel: { aiCode: 'ghost', preDispatchSize: 3 },
      },
    },
    labelAdmin,
    (s, j) => j.code === 'AI_CONFIG_NOT_FOUND',
  );
  const caseB = (
    await call('createCase B', '/api/case/createCase', bodyB, labelAdmin, (s, j) => j.success)
  ).data.caseId;
  d = await waitFor(
    () => detailOf(labelAdmin, caseB),
    (x) => x.stageProgress[0].done === 3 && x.stageProgress[1].personalDoing === 3,
    'AI pre-label done for 3 samples',
  );
  check(
    'LLM 被调用 3 次，带 Bearer 与 model',
    llmCalls.length >= 3 &&
      llmCalls.every(
        (c) =>
          c.auth === 'Bearer sk-smoke' && c.model === 'fake-1' && c.url === '/v1/chat/completions',
      ),
    JSON.stringify(llmCalls),
  );
  const gB = await myGroup(labeler2, caseB, 2);
  const bTasks = await tasksIn(labeler2, gB.taskGroupId, 2);
  const tb = bTasks[0].taskId;
  await call(
    'AI 预标结果可见',
    '/api/task/getTaskResult',
    { taskId: tb, sampleType: 1 },
    labeler2,
    (s, j) => j.success && j.data.result.label === 'ai-pre' && j.data.result.source === '第一条',
  );
  await call(
    'labeler2 submit as-is',
    '/api/task/submitLabelTask',
    { taskId: tb },
    labeler2,
    (s, j) => j.success,
  );
  const rB = await waitMyTask(reviewer, caseB, 4, 3, 'AI review passed → human review dispatched');
  check('AI 预审通过后进入人工初检', rB.task.bizId === 'b1', JSON.stringify(rB));
  await call(
    'AI 预审结果可见',
    '/api/task/getTaskResult',
    { taskId: rB.task.taskId, sampleType: 2 },
    reviewer,
    (s, j) =>
      j.success &&
      j.data.result.reviewAction === 1 &&
      j.data.result.reviewComment === 'AI 认为没问题',
  );
  // 第二条：标注员改成 bad → AI 预审驳回 → 回到标注员 REWORK
  const tb2 = bTasks[1].taskId;
  await call(
    'save bad',
    '/api/task/saveTaskResult',
    { taskId: tb2, sampleType: 1, result: { label: 'bad' } },
    labeler2,
    (s, j) => j.success,
  );
  await call(
    'submit bad',
    '/api/task/submitLabelTask',
    { taskId: tb2 },
    labeler2,
    (s, j) => j.success,
  );
  const rw = await waitFor(
    async () => (await tasksIn(labeler2, gB.taskGroupId, 5)).find((t) => t.taskId === tb2),
    (t) => !!t,
    'AI review rejected → REWORK',
  );
  check('AI 预审驳回：round 2', rw.round === 2, JSON.stringify(rw));
  await call(
    'AI 驳回意见可见',
    '/api/task/getTaskResult',
    { taskId: tb2, sampleType: 2 },
    labeler2,
    (s, j) => j.success && j.data.result.reviewComment === 'AI 认为标错了',
  );
  d = await detailOf(labelAdmin, caseB);
  check(
    'B 进度：aiPreLabel 3 done；aiPreReview 2 done',
    d.stageProgress[0].done === 3 && d.stageProgress[2].done === 2,
    JSON.stringify(d.stageProgress),
  );
} finally {
  llm.close();
}

const failed = results.filter((r) => !r.ok);
console.table(results.map((r) => ({ ...r, ok: r.ok ? '✓' : '✗' })));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
