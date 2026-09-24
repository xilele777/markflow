// M1 接口级冒烟：对运行中的后端（默认 8080）依次调用 workspace / user / labeltool / aiconfig / contribution 接口。
// 用法：node smoke-m1.mjs [baseUrl]
const base = process.argv[2] ?? 'http://127.0.0.1:8080';
const stamp = Date.now().toString(36).slice(-5);
const results = [];

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
  if (!ok) console.log('  !! unexpected:', name, res.status, JSON.stringify(json).slice(0, 300));
  return json;
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

const admin = await login(
  process.env.MARKFLOW_ADMIN_USERNAME ?? 'admin',
  process.env.MARKFLOW_ADMIN_INITIAL_PASSWORD ?? 'admin123456',
);

// 1. user
const labelerName = `m1lab${stamp}`;
const labelerId = (
  await call(
    'createUser labeler',
    '/api/user/create',
    { username: labelerName, displayName: '冒烟标注员', password: 'labeler123' },
    admin,
    (s, j) => j.success,
  )
).data.userId;
const adminName = `m1adm${stamp}`;
const adminId = (
  await call(
    'createUser labelAdmin',
    '/api/user/create',
    { username: adminName, displayName: '冒烟空间管理员', password: 'ladmin123' },
    admin,
    (s, j) => j.success,
  )
).data.userId;
await call(
  'createUser dup',
  '/api/user/create',
  { username: labelerName, displayName: 'x', password: 'labeler123' },
  admin,
  (s, j) => j.code === 'USERNAME_EXISTS',
);
await call(
  'getUserList keyword',
  '/api/user/getUserList',
  { keyword: `m1`, pageNum: 1, pageSize: 10 },
  admin,
  (s, j) => j.success && j.total >= 2 && typeof j.pageNum === 'number',
);
const labeler = await login(labelerName, 'labeler123');
await call(
  'getUserList as labeler',
  '/api/user/getUserList',
  {},
  labeler,
  (s, j) => s === 403 && j.code === 'PERMISSION_DENIED',
);

// 2. workspace
const spaceCode = `m1-ws-${stamp}`;
const wsId = (
  await call(
    'createWorkspace',
    '/api/workspace/createWorkspace',
    { spaceCode, name: '冒烟空间', description: 'M1 冒烟' },
    admin,
    (s, j) => j.success,
  )
).data.workspaceId;
await call(
  'createWorkspace dup',
  '/api/workspace/createWorkspace',
  { spaceCode, name: '冒烟空间2' },
  admin,
  (s, j) => j.code === 'SPACE_CODE_EXISTS',
);
await call(
  'addWorkspaceMember',
  '/api/workspace/addWorkspaceMember',
  {
    workspaceId: wsId,
    members: [
      { userId: adminId, roles: [3] },
      { userId: labelerId, roles: [1, 2] },
      { userId: 999999, roles: [1] },
    ],
  },
  admin,
  (s, j) => j.success && j.data.successCount === 3 && j.data.failures.length === 1,
);
const labelAdmin = await login(adminName, 'ladmin123');
await call(
  'getWorkspaceList as labeler',
  '/api/workspace/getWorkspaceList',
  {},
  labeler,
  (s, j) => j.success && j.total === 1 && j.data[0].workspaceId === wsId,
);
await call(
  'getWorkspaceDetail as labelAdmin',
  '/api/workspace/getWorkspaceDetail',
  { workspaceId: wsId },
  labelAdmin,
  (s, j) => j.success && j.data.members.length === 2,
);
await call(
  'getWorkspaceDetail as labeler',
  '/api/workspace/getWorkspaceDetail',
  { workspaceId: wsId },
  labeler,
  (s) => s === 403,
);

// 3. labeltool
const toolCode = `m1-tool-${stamp}`;
const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
};
const toolId = (
  await call(
    'createLabelTool iframe',
    '/api/labeltool/createLabelTool',
    {
      labelToolCode: toolCode,
      labelToolName: '冒烟外部工具',
      labelToolType: 2,
      labelToolUrl: 'https://example.com/tool',
      labelToolJsonSchema: schema,
      labelToolPageSchema: null,
    },
    admin,
    (s, j) => j.success,
  )
).data.labelToolId;
await call(
  'createLabelTool bad schema',
  '/api/labeltool/createLabelTool',
  {
    labelToolCode: `${toolCode}x`,
    labelToolName: '坏 schema',
    labelToolType: 1,
    labelToolJsonSchema: { id: 1, text: 'sample' },
  },
  admin,
  (s, j) => j.code === 'LABEL_TOOL_JSON_SCHEMA_INVALID',
);
await call(
  'getLabelToolList as labelAdmin',
  '/api/labeltool/getLabelToolList',
  { keyword: toolCode },
  labelAdmin,
  (s, j) => j.success && j.total === 1,
);
await call(
  'getLabelToolDetail',
  '/api/labeltool/getLabelToolDetail',
  { labelToolId: toolId },
  admin,
  (s, j) => j.success && j.data.labelToolJsonSchema.type === 'object',
);
await call(
  'getLabelToolList as labeler',
  '/api/labeltool/getLabelToolList',
  {},
  labeler,
  (s) => s === 403,
);

// 4. aiconfig
const aiCode = `m1-ai-${stamp}`;
await call(
  'createAiConfig',
  '/api/aiconfig/createAiConfig',
  {
    aiCode,
    name: '冒烟 AI 配置',
    labelToolCode: toolCode,
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-smoke-secret',
    model: 'gpt-4o-mini',
    prompt: '你是标注助手',
  },
  admin,
  (s, j) => j.success,
);
await call(
  'updateAiConfig partial',
  '/api/aiconfig/updateAiConfig',
  {
    aiCode,
    name: '冒烟 AI 配置（改）',
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-4.1',
    prompt: '你是标注助手',
  },
  admin,
  (s, j) => j.success,
);
const listAdmin = await call(
  'getAiConfigList admin',
  '/api/aiconfig/getAiConfigList',
  { labelToolCode: toolCode },
  admin,
  (s, j) =>
    j.success &&
    j.data.list.length === 1 &&
    j.data.list[0].model === 'gpt-4.1' &&
    !('apiKey' in j.data.list[0]),
);
await call(
  'getAiConfigList labelAdmin masked',
  '/api/aiconfig/getAiConfigList',
  { labelToolCode: toolCode },
  labelAdmin,
  (s, j) => j.success && j.data.list[0].baseUrl === null && j.data.list[0].prompt === null,
);
await call(
  'getAiConfigList labeler',
  '/api/aiconfig/getAiConfigList',
  {},
  labeler,
  (s) => s === 403,
);

// 5. contribution + changePassword
await call(
  'getMyContribution self',
  '/api/user/getMyContribution',
  { username: labelerName },
  labeler,
  (s, j) => j.success && j.data.overview.totalDoneCount === 0 && j.data.workspaces.length === 1,
);
await call(
  'getMyContribution by labelAdmin',
  '/api/user/getMyContribution',
  { username: labelerName },
  labelAdmin,
  (s, j) => j.success,
);
await call(
  'getMyContribution denied',
  '/api/user/getMyContribution',
  { username: adminName },
  labeler,
  (s) => s === 403,
);
await call(
  'changePassword wrong',
  '/api/user/changePassword',
  { oldPassword: 'nope', newPassword: 'labeler456' },
  labeler,
  (s, j) => j.code === 'WRONG_PASSWORD',
);
await call(
  'changePassword ok',
  '/api/user/changePassword',
  { oldPassword: 'labeler123', newPassword: 'labeler456' },
  labeler,
  (s, j) => j.success,
);
await login(labelerName, 'labeler456');

const failed = results.filter((r) => !r.ok);
console.table(results);
console.log(
  failed.length === 0 ? `ALL ${results.length} SMOKE CHECKS PASSED` : `${failed.length} FAILED`,
);
console.log(
  JSON.stringify(
    { spaceCode, labelerName, adminName, toolCode, aiCode, aiList: listAdmin.data.list },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 1);
