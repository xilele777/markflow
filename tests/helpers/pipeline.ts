// 测试辅助：任务流水线（M3）——建齐「空间 + 成员 + 工具 + AI 配置 + 就绪版本」的夹具，
// 组装 createCase 入参，注入假 LLM，启动任务域 worker，轮询等待异步流转。
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app/create-app.js';
import { createContext, destroyContext, type AppContext } from '../../src/app/context.js';
import { loadConfig } from '../../src/infra/config.js';
import type { ChatRequest, ChatResponse, LlmClient, LlmConfig } from '../../src/infra/llm.js';
import { obliterateQueue, QUEUE_NAMES } from '../../src/infra/queue.js';
import { SYS_CONFIG_KEYS, SysConfigType } from '../../src/infra/sys-config.js';
import { UploadStatus } from '../../src/modules/dataset/enums.js';
import { createTaskModule, type TaskModule } from '../../src/modules/task/module.js';
import {
  createCaseExportWorker,
  createTaskCompletedWorker,
  createTaskDispatchedWorker,
} from '../../src/modules/task/task.workers.js';
import { WorkspaceRole } from '../../src/modules/workspace/enums.js';
import {
  addMember,
  bearer,
  createLabelToolRow,
  createUserAndLogin,
  createWorkspace,
  uniq,
  type LoggedInUser,
} from './app.js';
import { insertDataset, insertVersion } from './dataset.js';
import { insertSample } from './seed.js';

/** 可编程假 LLM：按 (taskType 推断不了) 只按 user 消息内容分发；默认返回固定 JSON。 */
export class FakeLlm implements LlmClient {
  calls: Array<{ config: LlmConfig; request: ChatRequest }> = [];
  handler: (request: ChatRequest) => Promise<ChatResponse> | ChatResponse = () => ({
    content: JSON.stringify({ label: 'ai' }),
    finishReason: 'stop',
    promptTokens: null,
    completionTokens: null,
  });

  async chat(config: LlmConfig, request: ChatRequest): Promise<ChatResponse> {
    this.calls.push({ config, request });
    return this.handler(request);
  }

  /** 按 user 消息里是否含 labelResult 判断预标 / 预审。 */
  static isReview(request: ChatRequest): boolean {
    const user = request.messages.find((m) => m.role === 'user')?.content ?? '';
    return user.includes('"labelResult"');
  }
}

export interface PipelineHarness {
  app: Express;
  ctx: AppContext;
  mod: TaskModule;
  llm: FakeLlm;
  /** 启动三个任务域 worker（dataset-parse 不启）。 */
  startWorkers(): Promise<void>;
  close(): Promise<void>;
}

export async function createPipelineHarness(): Promise<PipelineHarness> {
  const config = loadConfig();
  const ctx = await createContext(config, { poolSize: 4 });
  const llm = new FakeLlm();
  const mod = createTaskModule(ctx, { llm });
  const app = createApp(ctx, { taskModule: mod });
  const workers: Array<{ close(): Promise<void> }> = [];
  return {
    app,
    ctx,
    mod,
    llm,
    async startWorkers() {
      for (const name of [
        QUEUE_NAMES.taskDispatched,
        QUEUE_NAMES.taskCompleted,
        QUEUE_NAMES.caseExport,
      ]) {
        await obliterateQueue(config, name);
      }
      const ws = [
        createTaskDispatchedWorker(ctx, mod),
        createTaskCompletedWorker(ctx, mod),
        createCaseExportWorker(ctx, mod),
      ];
      await Promise.all(ws.map((w) => w.waitUntilReady()));
      workers.push(...ws);
    },
    async close() {
      await Promise.all(workers.map((w) => w.close()));
      await destroyContext(ctx);
    },
  };
}

export interface Fixture {
  spaceCode: string;
  workspaceId: number;
  toolCode: string;
  aiCode: string;
  versionId: number;
  sampleIds: number[];
  labelAdmin: LoggedInUser;
  labeler1: LoggedInUser;
  labeler2: LoggedInUser;
  reviewer: LoggedInUser;
  /** 只在空间里但没有 LABELER 角色。 */
  outsider: LoggedInUser;
}

/** 建齐夹具：空间、四类成员、工具、AI 配置（直接写 sys_config，apiKey 明文可读）、含 sampleCount 条样本的就绪版本。 */
export async function createFixture(
  ctx: AppContext,
  app: Express,
  sampleCount = 5,
): Promise<Fixture> {
  const spaceCode = uniq('pl');
  const workspaceId = await createWorkspace(ctx, { spaceCode, name: `流水线 ${spaceCode}` });
  const labelAdmin = await createUserAndLogin(ctx, app, 'pla');
  const labeler1 = await createUserAndLogin(ctx, app, 'plb');
  const labeler2 = await createUserAndLogin(ctx, app, 'plc');
  const reviewer = await createUserAndLogin(ctx, app, 'plr');
  const outsider = await createUserAndLogin(ctx, app, 'plo');
  await addMember(ctx, workspaceId, labelAdmin.userId, WorkspaceRole.LABEL_ADMIN);
  await addMember(ctx, workspaceId, labeler1.userId, WorkspaceRole.LABELER);
  await addMember(ctx, workspaceId, labeler2.userId, WorkspaceRole.LABELER);
  await addMember(ctx, workspaceId, reviewer.userId, WorkspaceRole.REVIEWER);
  await addMember(ctx, workspaceId, outsider.userId, WorkspaceRole.REVIEWER);
  const toolCode = uniq('pt');
  await createLabelToolRow(ctx, { labelToolCode: toolCode });
  const aiCode = await upsertAiConfig(ctx, toolCode);
  const datasetId = await insertDataset(ctx, {
    spaceCode,
    datasetName: uniq('pd'),
    labelToolCode: toolCode,
  });
  const versionId = await insertVersion(ctx, {
    datasetId,
    ossPath: 'dataset/test/x.jsonl',
    uploadStatus: UploadStatus.READY,
    sampleCount,
  });
  const sampleIds: number[] = [];
  for (let i = 1; i <= sampleCount; i += 1) {
    sampleIds.push(
      await insertSample(ctx, {
        datasetVersionId: versionId,
        bizId: `biz-${i}`,
        sampleData: { text: `样本 ${i}`, bizId: `biz-${i}` },
      }),
    );
  }
  return {
    spaceCode,
    workspaceId,
    toolCode,
    aiCode,
    versionId,
    sampleIds,
    labelAdmin,
    labeler1,
    labeler2,
    reviewer,
    outsider,
  };
}

/** 往 sys_config[ai.configList] 追加一条 AI 配置（apiKey 明文；服务读取时原样返回）。 */
export async function upsertAiConfig(ctx: AppContext, labelToolCode: string): Promise<string> {
  const aiCode = uniq('ai');
  const raw = await ctx.sysConfig.getOrNull(SYS_CONFIG_KEYS.aiConfigList);
  const list: unknown[] = raw ? (JSON.parse(raw) as unknown[]) : [];
  list.push({
    aiCode,
    name: `AI ${aiCode}`,
    labelToolCode,
    baseUrl: 'http://llm.test/v1',
    apiKey: 'test-key',
    model: 'test-model',
    prompt: '你是标注助手',
  });
  await ctx.sysConfig.saveOrUpdate(
    SYS_CONFIG_KEYS.aiConfigList,
    'AI 配置列表',
    SysConfigType.JSON,
    JSON.stringify(list),
    'test',
  );
  return aiCode;
}

export type StageName = 'aiPreLabel' | 'label' | 'aiPreReview' | 'review' | 'recheck';

export interface CaseBodyOptions {
  name?: string;
  stages?: StageName[];
  labelers?: string[];
  reviewers?: string[];
  recheckers?: string[];
  strategy?: number;
  ratios?: Record<string, number | null>;
  preDispatchSize?: number;
  autoRecycleMinutes?: number | null;
  /** 标为 active=false 的成员。 */
  inactive?: string[];
  aiPreDispatchSize?: number;
  datasetVersionId?: number;
  description?: string;
}

/** 组装 createCase 入参：默认 label → review 两阶段、FCFS、预派 3。 */
export function caseBody(f: Fixture, o: CaseBodyOptions = {}) {
  const stages = o.stages ?? ['label', 'review'];
  const labelers = o.labelers ?? [f.labeler1.username];
  const reviewers = o.reviewers ?? [f.reviewer.username];
  const recheckers = o.recheckers ?? [f.reviewer.username];
  const strategy = o.strategy ?? 1;
  // FIXED_RATIO 下未显式给比例的阶段：成员平分（单人 100），便于只在一个阶段上验证配额。
  const member = (username: string, names: string[]) => ({
    username,
    ratio: o.ratios
      ? (o.ratios[username] ?? (strategy === 2 ? Math.floor(100 / names.length) : null))
      : strategy === 2
        ? Math.floor(100 / names.length)
        : null,
    active: o.inactive?.includes(username) ? false : true,
  });
  const human = (names: string[]) => ({
    strategy,
    preDispatchSize: o.preDispatchSize ?? 3,
    autoRecycleMinutes: o.autoRecycleMinutes === undefined ? null : o.autoRecycleMinutes,
    members: names.map((n) => member(n, names)),
  });
  const ai = () => ({
    aiCode: f.aiCode,
    preDispatchSize: o.aiPreDispatchSize ?? 3,
    autoRecycleMinutes: o.autoRecycleMinutes === undefined ? null : o.autoRecycleMinutes,
  });
  const assignmentConfig: Record<string, unknown> = {};
  if (stages.includes('aiPreLabel')) assignmentConfig['aiPreLabel'] = ai();
  if (stages.includes('label')) assignmentConfig['label'] = human(labelers);
  if (stages.includes('aiPreReview')) assignmentConfig['aiPreReview'] = ai();
  if (stages.includes('review')) assignmentConfig['review'] = human(reviewers);
  if (stages.includes('recheck')) assignmentConfig['recheck'] = human(recheckers);
  return {
    spaceCode: f.spaceCode,
    name: o.name ?? `case ${uniq('c')}`,
    description: o.description ?? '',
    dataSourceType: 1,
    datasetVersionId: o.datasetVersionId ?? f.versionId,
    labelTool: f.toolCode,
    taskPlanConfig: { stages: stages.map((type) => ({ stage: 0, type })) },
    assignmentConfig,
  };
}

export function post(app: Express, path: string, token: string, body: object): request.Test {
  return request(app).post(path).set('Authorization', bearer(token)).send(body);
}

export async function createCaseOk(app: Express, token: string, body: object): Promise<number> {
  const res = await post(app, '/api/case/createCase', token, body);
  if (!res.body?.success) throw new Error(`createCase failed: ${JSON.stringify(res.body)}`);
  return res.body.data.caseId as number;
}

export function selectTasks(ctx: AppContext, caseId: number) {
  return ctx.db
    .selectFrom('label_task')
    .selectAll()
    .where('caseId', '=', caseId)
    .orderBy('taskType')
    .orderBy('dataSampleId')
    .execute();
}

export function selectGroups(ctx: AppContext, caseId: number) {
  return ctx.db
    .selectFrom('label_task_group')
    .selectAll()
    .where('caseId', '=', caseId)
    .orderBy('id')
    .execute();
}

/** 轮询直到条件满足；超时抛错并附带最后一次取值。 */
export async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeoutMs = 15_000,
  label = 'condition',
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  for (;;) {
    last = await fn();
    if (predicate(last)) return last;
    if (Date.now() > deadline) {
      throw new Error(`waitFor(${label}) timeout; last=${JSON.stringify(last)}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** 等某 case 里 (taskType, dataSampleId) 的 task 出现并满足条件。 */
export function waitForTask(
  ctx: AppContext,
  caseId: number,
  taskType: number,
  dataSampleId: number,
  predicate: (t: { status: number; round: number; annotator: string | null }) => boolean,
  label = `task ${taskType}/${dataSampleId}`,
) {
  return waitFor(
    () =>
      ctx.db
        .selectFrom('label_task')
        .selectAll()
        .where('caseId', '=', caseId)
        .where('taskType', '=', taskType)
        .where('dataSampleId', '=', dataSampleId)
        .executeTakeFirst(),
    (t) => t !== undefined && predicate(t),
    15_000,
    label,
  ).then((t) => t as NonNullable<typeof t>);
}

/** 用 labeler 身份：保存标注结果并提交某 task。 */
export async function labelAndSubmit(
  app: Express,
  token: string,
  taskId: number,
  result: unknown = { label: 'ok' },
): Promise<void> {
  const save = await post(app, '/api/task/saveTaskResult', token, {
    taskId,
    sampleType: 1,
    result,
  });
  if (!save.body?.success) throw new Error(`save failed: ${JSON.stringify(save.body)}`);
  const submit = await post(app, '/api/task/submitLabelTask', token, { taskId });
  if (!submit.body?.success) throw new Error(`submit failed: ${JSON.stringify(submit.body)}`);
}

export async function review(
  app: Express,
  token: string,
  taskId: number,
  reviewAction: 0 | 1,
  reviewComment?: string,
): Promise<request.Response> {
  return post(app, '/api/task/submitReviewTask', token, { taskId, reviewAction, reviewComment });
}
