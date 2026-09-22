// M2 接口级冒烟：对运行中的后端（默认 8080）跑通 dataset 六个接口 + 预签名直传 + 异步解析。
// 用法：node smoke-m2.mjs [baseUrl]
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

async function uploadViaPresign(token, fileName, content) {
  const pre = await call(
    `presign ${fileName}`,
    '/api/dataset/getUploadPreSignedUrl',
    { fileName },
    token,
    (s, j) => j.success && j.data.httpMethod === 'PUT' && j.data.expiresInSeconds === 3600,
  );
  const put = await fetch(pre.data.uploadUrl, { method: 'PUT', body: content });
  check(`PUT ${fileName} → MinIO`, put.status === 200, `status ${put.status}`);
  return pre.data.objectKey;
}

async function waitParsed(token, datasetId, versionId, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(base + '/api/dataset/getDatasetDetail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ datasetId }),
    });
    const json = await res.json();
    const v = json.data?.versions?.find((x) => x.versionId === versionId);
    if (v && v.uploadStatus !== 1) return v;
    if (Date.now() > deadline) throw new Error(`version ${versionId} still PARSING`);
    await sleep(300);
  }
}

const admin = await login(
  process.env.LINGSHU_ADMIN_USERNAME ?? 'admin',
  process.env.LINGSHU_ADMIN_INITIAL_PASSWORD ?? 'admin123456',
);

// 前置主数据
const spaceCode = `m2-ws-${stamp}`;
const wsId = (
  await call(
    'createWorkspace',
    '/api/workspace/createWorkspace',
    { spaceCode, name: 'M2 冒烟空间' },
    admin,
    (s, j) => j.success,
  )
).data.workspaceId;
const adminName = `m2adm${stamp}`;
const adminId = (
  await call(
    'createUser labelAdmin',
    '/api/user/create',
    { username: adminName, displayName: 'M2 空间管理员', password: 'ladmin123' },
    admin,
    (s, j) => j.success,
  )
).data.userId;
const labelerName = `m2lab${stamp}`;
const labelerId = (
  await call(
    'createUser labeler',
    '/api/user/create',
    { username: labelerName, displayName: 'M2 标注员', password: 'labeler123' },
    admin,
    (s, j) => j.success,
  )
).data.userId;
await call(
  'addWorkspaceMember',
  '/api/workspace/addWorkspaceMember',
  {
    workspaceId: wsId,
    members: [
      { userId: adminId, roles: [3] },
      { userId: labelerId, roles: [1] },
    ],
  },
  admin,
  (s, j) => j.success && j.data.successCount === 2,
);
const toolCode = `m2-tool-${stamp}`;
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
    labelToolName: 'M2 冒烟工具',
    labelToolType: 1,
    labelToolJsonSchema: schema,
    labelToolPageSchema: null,
  },
  admin,
  (s, j) => j.success,
);
const labelAdmin = await login(adminName, 'ladmin123');
const labeler = await login(labelerName, 'labeler123');

// 1. 预签名
await call(
  'presign as labeler',
  '/api/dataset/getUploadPreSignedUrl',
  { fileName: 'a.jsonl' },
  labeler,
  (s) => s === 403,
);
await call(
  'presign missing fileName',
  '/api/dataset/getUploadPreSignedUrl',
  {},
  labelAdmin,
  (s, j) => j.code === 'UPLOAD_FILE_NAME_REQUIRED',
);
const goodKey = await uploadViaPresign(
  labelAdmin,
  '样本.jsonl',
  '{"text":"第一条","bizId":"b1"}\n{"text":"第二条","bizId":"b2"}\n\n{"text":"第三条"}\n',
);
check('objectKey 格式', /^dataset\/\d{8}\/[0-9a-f]{32}\.jsonl$/.test(goodKey), goodKey);

// 2. 建数据集 → 解析 → 详情 → 预览
await call(
  'createDataset as labeler',
  '/api/dataset/createDataset',
  { spaceCode, datasetName: '冒烟数据集', labelToolCode: toolCode, ossPath: goodKey },
  labeler,
  (s) => s === 403,
);
await call(
  'createDataset bad name',
  '/api/dataset/createDataset',
  { spaceCode, datasetName: 'ab', labelToolCode: toolCode, ossPath: goodKey },
  labelAdmin,
  (s, j) => j.code === 'DATASET_NAME_INVALID',
);
await call(
  'createDataset unknown tool',
  '/api/dataset/createDataset',
  { spaceCode, datasetName: '冒烟数据集', labelToolCode: 'ghost', ossPath: goodKey },
  labelAdmin,
  (s, j) => j.code === 'LABEL_TOOL_NOT_FOUND',
);
const created = await call(
  'createDataset',
  '/api/dataset/createDataset',
  {
    spaceCode,
    datasetName: '冒烟数据集',
    datasetDesc: 'M2 冒烟',
    labelToolCode: toolCode,
    ossPath: goodKey,
    versionDesc: '初始版本',
  },
  labelAdmin,
  (s, j) => j.success && j.data.versionNumber === 1,
);
const { datasetId, versionId } = created.data;
await call(
  'createDataset dup',
  '/api/dataset/createDataset',
  { spaceCode, datasetName: '冒烟数据集', labelToolCode: toolCode, ossPath: goodKey },
  labelAdmin,
  (s, j) => j.code === 'DATASET_NAME_EXISTS',
);
const v1 = await waitParsed(labelAdmin, datasetId, versionId);
check(
  'v1 READY sampleCount=3',
  v1.uploadStatus === 2 &&
    v1.sampleCount === 3 &&
    v1.parseExt?.totalRowCount === 3 &&
    v1.parseExt?.skippedRowCount === 0,
  JSON.stringify(v1),
);
const preview = await call(
  'getVersionSamplePreview',
  '/api/dataset/getVersionSamplePreview',
  { versionId },
  labelAdmin,
  (s, j) =>
    j.success &&
    j.data.list.length === 3 &&
    j.data.list[0].bizId === 'b1' &&
    j.data.list[0].sampleData.text === '第一条' &&
    j.data.list[2].bizId === null,
);
await call(
  'preview as labeler',
  '/api/dataset/getVersionSamplePreview',
  { versionId },
  labeler,
  (s) => s === 403,
);

// 3. 新版本：坏行 → READY + sampleErrors；错误后缀 → PARSE_FAILED
const mixedKey = await uploadViaPresign(
  labelAdmin,
  'mixed.jsonl',
  '{"text":"ok"}\nnot json\n{"bizId":"no-text"}\n',
);
const v2 = await call(
  'createDatasetVersion mixed',
  '/api/dataset/createDatasetVersion',
  { datasetId, ossPath: mixedKey, versionDesc: '含坏行' },
  labelAdmin,
  (s, j) => j.success && j.data.versionNumber === 2,
);
const v2Parsed = await waitParsed(labelAdmin, datasetId, v2.data.versionId);
check(
  'v2 READY skipped=2 errors 记录',
  v2Parsed.uploadStatus === 2 &&
    v2Parsed.sampleCount === 1 &&
    v2Parsed.parseExt?.skippedRowCount === 2 &&
    v2Parsed.parseExt?.sampleErrors?.length === 2,
  JSON.stringify(v2Parsed.parseExt),
);
const csvKey = await uploadViaPresign(labelAdmin, 'bad.csv', 'a,b\n1,2\n');
const v3 = await call(
  'createDatasetVersion csv',
  '/api/dataset/createDatasetVersion',
  { datasetId, ossPath: csvKey },
  labelAdmin,
  (s, j) => j.success && j.data.versionNumber === 3,
);
const v3Parsed = await waitParsed(labelAdmin, datasetId, v3.data.versionId);
check(
  'v3 PARSE_FAILED 原因可见',
  v3Parsed.uploadStatus === 3 && v3Parsed.parseExt?.parseFailureReason === '不支持的文件类型',
  JSON.stringify(v3Parsed.parseExt),
);
await call(
  'createDatasetVersion as labeler',
  '/api/dataset/createDatasetVersion',
  { datasetId, ossPath: goodKey },
  labeler,
  (s) => s === 403,
);
await call(
  'createDatasetVersion missing ossPath',
  '/api/dataset/createDatasetVersion',
  { datasetId },
  labelAdmin,
  (s, j) => j.code === 'OSS_PATH_REQUIRED',
);

// 4. 列表 / 详情
const detail = await call(
  'getDatasetDetail',
  '/api/dataset/getDatasetDetail',
  { datasetId },
  labelAdmin,
  (s, j) =>
    j.success &&
    j.data.latestVersionNumber === 3 &&
    j.data.versions.map((v) => v.versionNumber).join() === '3,2,1' &&
    j.data.labelToolCode === toolCode,
);
await call(
  'getDatasetList',
  '/api/dataset/getDatasetList',
  { spaceCode, keyword: '冒烟', pageNum: 1, pageSize: 10 },
  labelAdmin,
  (s, j) => j.success && j.total === 1 && j.data[0].latestVersionNumber === 3,
);
await call(
  'getDatasetList as admin',
  '/api/dataset/getDatasetList',
  { spaceCode },
  admin,
  (s, j) => j.success && j.total === 1,
);
await call(
  'getDatasetList as labeler',
  '/api/dataset/getDatasetList',
  { spaceCode },
  labeler,
  (s) => s === 403,
);
await call(
  'getDatasetList unknown space',
  '/api/dataset/getDatasetList',
  { spaceCode: 'ghost' },
  admin,
  (s, j) => j.code === 'WORKSPACE_NOT_FOUND',
);
await call(
  'getDatasetDetail unknown',
  '/api/dataset/getDatasetDetail',
  { datasetId: 999999999 },
  admin,
  (s, j) => j.code === 'DATASET_NOT_FOUND',
);

const failed = results.filter((r) => !r.ok);
console.table(results);
console.log(
  failed.length === 0 ? `ALL ${results.length} SMOKE CHECKS PASSED` : `${failed.length} FAILED`,
);
console.log(
  JSON.stringify(
    {
      spaceCode,
      adminName,
      labelerName,
      toolCode,
      datasetId,
      versions: detail.data?.versions?.map((v) => ({
        v: v.versionNumber,
        status: v.uploadStatus,
        n: v.sampleCount,
      })),
      previewFirst: preview.data?.list?.[0],
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 1);
