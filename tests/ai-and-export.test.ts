// AI 执行器 + LLM 客户端：预标 / 预审成功链路（走真实提交路径）、失败分类与 ext.aiFailure、重试、驳回 AI task 再触发、导出。
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LlmError, OpenAiCompatibleLlmClient, parseResponse } from '../src/infra/llm.js';
import {
  AiExecutionError,
  classify,
  parseJsonOrNull,
} from '../src/modules/task/ai-task-executor.js';
import { csvCell } from '../src/modules/task/case-export.service.js';
import { TaskStatus, TaskType } from '../src/modules/task/enums.js';
import {
  caseBody,
  createCaseOk,
  createFixture,
  createPipelineHarness,
  FakeLlm,
  labelAndSubmit,
  post,
  review,
  waitFor,
  waitForTask,
  type Fixture,
  type PipelineHarness,
} from './helpers/pipeline.js';

describe('LLM 客户端', () => {
  it('解析聚合 JSON 与 SSE；空体 / 无 choices 报 LLM_RESPONSE_INVALID', () => {
    expect(
      parseResponse(
        JSON.stringify({
          choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 1 },
        }),
      ),
    ).toEqual({ content: 'hi', finishReason: 'stop', promptTokens: 3, completionTokens: 1 });
    const sse = [
      'data: {"choices":[{"delta":{"content":"{\\"a\\":"}}]}',
      'data: {"choices":[{"delta":{"content":"1}"},"finish_reason":"stop"}]}',
      ': keepalive',
      'data: [DONE]',
      '',
    ].join('\n');
    expect(parseResponse(sse)).toMatchObject({ content: '{"a":1}', finishReason: 'stop' });
    expect(() => parseResponse('')).toThrow(LlmError);
    expect(() => parseResponse('{"choices":[]}')).toThrowError(/missing choices/);
    expect(() => parseResponse('not json')).toThrowError(/unparseable/);
  });

  it('HTTP 429 / 5xx 可重试，4xx 不可重试，超时可重试；apiKey 只在头里', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const mk = (status: number, body = 'err') =>
      new OpenAiCompatibleLlmClient(async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(body, { status });
      });
    const cfg = { baseUrl: 'http://x/v1/', apiKey: 'sk-secret', model: 'm' };
    const req = { messages: [{ role: 'user' as const, content: 'q' }] };
    await expect(mk(429).chat(cfg, req)).rejects.toMatchObject({
      retryable: true,
      code: 'LLM_HTTP_ERROR',
    });
    await expect(mk(503).chat(cfg, req)).rejects.toMatchObject({ retryable: true });
    const e400 = (await mk(400, 'bad')
      .chat(cfg, req)
      .then(
        () => null,
        (e) => e as LlmError,
      )) as LlmError;
    expect(e400).toMatchObject({ retryable: false, code: 'LLM_HTTP_ERROR' });
    expect(e400.message).not.toContain('sk-secret');
    expect(calls[0]!.url).toBe('http://x/v1/chat/completions');
    expect((calls[0]!.init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer sk-secret',
    );
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ model: 'm', stream: false });

    const timeoutClient = new OpenAiCompatibleLlmClient(async () => {
      const err = new Error('t');
      err.name = 'TimeoutError';
      throw err;
    });
    await expect(timeoutClient.chat(cfg, req)).rejects.toMatchObject({
      code: 'LLM_TIMEOUT',
      retryable: true,
    });
    await expect(mk(200).chat({ ...cfg, apiKey: '' }, req)).rejects.toMatchObject({
      code: 'LLM_CONFIG_INVALID',
      retryable: false,
    });
  });

  it('parseJsonOrNull 剥围栏；classify 分类', () => {
    expect(parseJsonOrNull('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonOrNull('  {"a":1} ')).toEqual({ a: 1 });
    expect(parseJsonOrNull('nope')).toBeUndefined();
    expect(classify(new Error('db down'))).toMatchObject({ retryable: true, code: 'SYSTEM_ERROR' });
    expect(classify(new AiExecutionError('X', 'm', false))).toMatchObject({ retryable: false });
  });

  it('csvCell RFC 4180', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
  });
});

describe('AI 预标 / 预审 与 导出（消费者在进程内）', () => {
  let h: PipelineHarness;
  let f: Fixture;

  beforeAll(async () => {
    h = await createPipelineHarness();
    await h.startWorkers();
    f = await createFixture(h.ctx, h.app, 2);
  });
  afterAll(() => h.close());

  const taskOf = (caseId: number, taskType: number, sampleId: number) =>
    h.ctx.db
      .selectFrom('label_task')
      .selectAll()
      .where('caseId', '=', caseId)
      .where('taskType', '=', taskType)
      .where('dataSampleId', '=', sampleId)
      .executeTakeFirstOrThrow();

  it('aiPreLabel → label：AI 自动标注并提交，结果落库，样本进入人工标注池并派给标注员', async () => {
    h.llm.handler = (req) => ({
      content:
        '```json\n{"label":"ai-says","echo":' + JSON.stringify(req.messages[1]!.content) + '}\n```',
      finishReason: 'stop',
      promptTokens: 1,
      completionTokens: 1,
    });
    const caseId = await createCaseOk(
      h.app,
      f.labelAdmin.token,
      caseBody(f, { stages: ['aiPreLabel', 'label'], preDispatchSize: 2, aiPreDispatchSize: 2 }),
    );
    const [s1, s2] = f.sampleIds as [number, number];
    const ai1 = await waitForTask(
      h.ctx,
      caseId,
      TaskType.AI_LABEL,
      s1,
      (t) => t.status === TaskStatus.DONE,
    );
    expect(ai1.annotator).toBe(f.aiCode);
    await waitForTask(h.ctx, caseId, TaskType.AI_LABEL, s2, (t) => t.status === TaskStatus.DONE);
    const l1 = await waitForTask(
      h.ctx,
      caseId,
      TaskType.LABEL,
      s1,
      (t) => t.status === TaskStatus.LABELING,
    );
    expect(l1.annotator).toBe(f.labeler1.username);
    // 标注员看到 AI 预标结果
    const result = await post(h.app, '/api/task/getTaskResult', f.labeler1.token, {
      taskId: l1.id,
      sampleType: 1,
    });
    expect(result.body.data.result).toMatchObject({ label: 'ai-says' });
    expect(JSON.parse(result.body.data.result.echo)).toEqual({ text: '样本 1', bizId: 'biz-1' });
    // system prompt 来自 AI 配置；apiKey 解密后传入
    const call = h.llm.calls.find((c) => c.request.messages[1]!.content.includes('biz-1'))!;
    expect(call.request.messages[0]).toEqual({ role: 'system', content: '你是标注助手' });
    expect(call.config).toMatchObject({
      apiKey: 'test-key',
      model: 'test-model',
      baseUrl: 'http://llm.test/v1',
    });
    // AI 个人组存在
    const g = await h.ctx.db
      .selectFrom('label_task_group')
      .selectAll()
      .where('caseId', '=', caseId)
      .where('annotator', '=', f.aiCode)
      .executeTakeFirstOrThrow();
    expect(g).toMatchObject({ type: 1, stage: 1 });
  });

  it('label → aiPreReview → review：AI 预审驳回（留组重新触发 AI 不适用，target 是人工）→ 标注员重做 → AI 预审通过 → review', async () => {
    let reviewCalls = 0;
    h.llm.handler = (req) => {
      if (FakeLlm.isReview(req)) {
        reviewCalls += 1;
        const user = JSON.parse(req.messages[1]!.content) as { labelResult: { label: string } };
        const pass = user.labelResult.label === 'good';
        return {
          content: JSON.stringify({
            reviewAction: pass ? 1 : 0,
            reviewComment: pass ? 'fine' : 'redo',
          }),
          finishReason: 'stop',
          promptTokens: null,
          completionTokens: null,
        };
      }
      return { content: '{}', finishReason: 'stop', promptTokens: null, completionTokens: null };
    };
    const f3 = await createFixture(h.ctx, h.app, 1);
    const caseId = await createCaseOk(
      h.app,
      f3.labelAdmin.token,
      caseBody(f3, { stages: ['label', 'aiPreReview', 'review'], preDispatchSize: 1 }),
    );
    const sid = f3.sampleIds[0]!;
    const l = await taskOf(caseId, TaskType.LABEL, sid);
    await labelAndSubmit(h.app, f3.labeler1.token, l.id, { label: 'bad' });
    // AI 预审驳回 → label task REWORK round 2
    const reworked = await waitForTask(
      h.ctx,
      caseId,
      TaskType.LABEL,
      sid,
      (t) => t.status === TaskStatus.REWORK,
    );
    expect(reworked.round).toBe(2);
    expect((await taskOf(caseId, TaskType.AI_REVIEW, sid)).status).toBe(TaskStatus.DONE);
    const comment = await post(h.app, '/api/task/getTaskResult', f3.labeler1.token, {
      taskId: reworked.id,
      sampleType: 2,
    });
    expect(comment.body.data.result).toEqual({ reviewAction: 0, reviewComment: 'redo' });
    // 重做 → AI 预审重开并通过 → review 派给审核员
    await labelAndSubmit(h.app, f3.labeler1.token, reworked.id, { label: 'good' });
    const r = await waitForTask(
      h.ctx,
      caseId,
      TaskType.FIRST_CHECK,
      sid,
      (t) => t.status === TaskStatus.REVIEWING,
    );
    expect(r.annotator).toBe(f3.reviewer.username);
    const ai2 = await taskOf(caseId, TaskType.AI_REVIEW, sid);
    expect(ai2).toMatchObject({ status: TaskStatus.DONE, round: 2 });
    expect(reviewCalls).toBe(2);
    // 人工驳回 AI 预审 task（上一阶段为 AI，aiCode active）→ AI 任务 REWORK 并重新触发 → AI 再次通过 → review 重开
    reviewCalls = 0;
    expect((await review(h.app, f3.reviewer.token, r.id, 0, 'human says no')).body.success).toBe(
      true,
    );
    const r2 = await waitForTask(
      h.ctx,
      caseId,
      TaskType.FIRST_CHECK,
      sid,
      (t) => t.status === TaskStatus.REVIEWING && t.round === 2,
      'review round 2',
    );
    expect(r2.annotator).toBe(f3.reviewer.username);
    const ai3 = await taskOf(caseId, TaskType.AI_REVIEW, sid);
    expect(ai3).toMatchObject({ status: TaskStatus.DONE, round: 3 });
    expect(reviewCalls).toBe(1);
  });

  it('AI 失败分类：永久失败（非 JSON）写 ext.aiFailure 且不重试；瞬时失败重试 3 次后仍记录；任务停留在手供回收', async () => {
    let n = 0;
    h.llm.handler = () => {
      n += 1;
      return {
        content: 'not json at all',
        finishReason: 'stop',
        promptTokens: null,
        completionTokens: null,
      };
    };
    const f4 = await createFixture(h.ctx, h.app, 1);
    const caseId = await createCaseOk(
      h.app,
      f4.labelAdmin.token,
      caseBody(f4, { stages: ['aiPreLabel', 'label'], aiPreDispatchSize: 1 }),
    );
    const sid = f4.sampleIds[0]!;
    const failed = await waitFor(
      () => taskOf(caseId, TaskType.AI_LABEL, sid),
      (t) => (t.ext as { aiFailure?: unknown } | null)?.aiFailure !== undefined,
      15_000,
      'aiFailure recorded',
    );
    expect(failed.status).toBe(TaskStatus.LABELING);
    expect(
      (failed.ext as { aiFailure: { code: string; retryable: boolean; attempts: number } })
        .aiFailure,
    ).toMatchObject({
      code: 'LLM_RESPONSE_INVALID',
      retryable: false,
      attempts: 1,
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(n).toBe(1);

    // 瞬时失败：抛 503 → BullMQ 重试；用假客户端直接抛可重试错误
    n = 0;
    h.llm.handler = () => {
      n += 1;
      throw new LlmError({ code: 'LLM_HTTP_ERROR', message: 'x' }, true, 'HTTP 503');
    };
    const f5 = await createFixture(h.ctx, h.app, 1);
    // 缩短退避：直接调执行器验证分类；队列层重试由 BullMQ 保证（attempts=3）
    const caseId5 = await createCaseOk(
      h.app,
      f5.labelAdmin.token,
      caseBody(f5, { stages: ['aiPreLabel', 'label'], aiPreDispatchSize: 1 }),
    );
    const sid5 = f5.sampleIds[0]!;
    const t5 = await waitFor(
      () => taskOf(caseId5, TaskType.AI_LABEL, sid5),
      (t) =>
        (t.ext as { aiFailure?: { retryable: boolean } } | null)?.aiFailure?.retryable === true,
      15_000,
      'retryable failure recorded',
    );
    expect((t5.ext as { aiFailure: { code: string } }).aiFailure.code).toBe('LLM_HTTP_ERROR');
    const job = await waitFor(
      async () =>
        (await h.ctx.queues.taskDispatched.getJobs(['delayed', 'failed', 'waiting'])).find(
          (j) => j.data.taskId === t5.id,
        ),
      (j) => j !== undefined,
      5_000,
      'job scheduled for retry',
    );
    expect(job!.attemptsMade).toBeGreaterThanOrEqual(1);
    expect(job!.opts.attempts).toBe(3);

    // 成功后清除 aiFailure：直接对该 task 再执行一次
    h.llm.handler = () => ({
      content: '{"ok":true}',
      finishReason: 'stop',
      promptTokens: null,
      completionTokens: null,
    });
    await job!.remove().catch(() => undefined);
    expect(await h.mod.aiExecutor.execute(t5.id, 9)).toBe('done');
    const doneRow = await taskOf(caseId5, TaskType.AI_LABEL, sid5);
    expect(doneRow.status).toBe(TaskStatus.DONE);
    expect((doneRow.ext as { aiFailure?: unknown } | null)?.aiFailure).toBeUndefined();
    // 已完成再执行 → skipped
    expect(await h.mod.aiExecutor.execute(t5.id)).toBe('skipped');
    const metrics = await h.ctx.metrics.registry.metrics();
    expect(metrics).toMatch(/lingshu_ai_executions_total\{stage="1",outcome="success"\} [1-9]/);
    expect(metrics).toMatch(
      /lingshu_ai_executions_total\{stage="1",outcome="permanent_failure"\} [1-9]/,
    );
    expect(metrics).toMatch(
      /lingshu_ai_executions_total\{stage="1",outcome="retryable_failure"\} [1-9]/,
    );
  });

  it('导出：CSV 与 JSONL 上传对象存储；详情返回现签的 downloadUrl；无结果的样本列为空', async () => {
    const f6 = await createFixture(h.ctx, h.app, 2);
    const caseId = await createCaseOk(
      h.app,
      f6.labelAdmin.token,
      caseBody(f6, { preDispatchSize: 2 }),
    );
    const [s1, s2] = f6.sampleIds as [number, number];
    const l1 = await taskOf(caseId, TaskType.LABEL, s1);
    await labelAndSubmit(h.app, f6.labeler1.token, l1.id, { label: 'x,"y"' });
    const r1 = await waitForTask(h.ctx, caseId, TaskType.FIRST_CHECK, s1, (t) => t.status === 3);
    await review(h.app, f6.reviewer.token, r1.id, 1, 'fine');

    for (const format of ['csv', 'jsonl'] as const) {
      expect(
        (await post(h.app, '/api/case/exportCaseResult', f6.labelAdmin.token, { caseId, format }))
          .body.success,
      ).toBe(true);
      const detail = await waitFor(
        async () =>
          (await post(h.app, '/api/case/getCaseDetail', f6.labelAdmin.token, { caseId })).body.data,
        (d) => d.ext?.lastExport?.status === 'DONE' && d.ext.lastExport.format === format,
        15_000,
        `export ${format} done`,
      );
      const last = detail.ext.lastExport;
      expect(last.objectKey).toMatch(
        new RegExp(`^export/case/${caseId}/\\d{8}/[0-9a-f]{32}\\.${format}$`),
      );
      expect(last.downloadUrl).toContain('X-Amz-Signature=');
      expect(last.finishTime).toBeGreaterThanOrEqual(last.triggerTime);
      const stream = await h.ctx.storage.getObjectStream(last.objectKey);
      const text = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        (stream as Readable).on('data', (c: Buffer) => chunks.push(c));
        (stream as Readable).on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        (stream as Readable).on('error', reject);
      });
      const lines = text.split('\n').filter((l) => l !== '');
      if (format === 'csv') {
        expect(lines[0]).toBe(
          '﻿caseId,bizId,sourceSampleId,inputData,labelResultId,labelResult,reviewResultId,reviewResult',
        );
        expect(lines).toHaveLength(3);
        expect(lines[1]).toContain(
          `${caseId},biz-1,${s1},"{""text"":""样本 1"",""bizId"":""biz-1""}"`,
        );
        expect(lines[1]).toContain('"{""label"":""x,\\""y\\""""}"');
        expect(lines[1]).toContain('"{""reviewAction"":1,""reviewComment"":""fine""}"');
        expect(lines[2]).toBe(
          `${caseId},biz-2,${s2},"{""text"":""样本 2"",""bizId"":""biz-2""}",,,,`,
        );
      } else {
        expect(lines).toHaveLength(2);
        const row1 = JSON.parse(lines[0]!);
        expect(row1).toMatchObject({
          caseId,
          bizId: 'biz-1',
          sourceSampleId: s1,
          inputData: { text: '样本 1' },
          labelResult: { label: 'x,"y"' },
          reviewResult: { reviewAction: 1, reviewComment: 'fine' },
        });
        expect(typeof row1.labelResultId).toBe('number');
        expect(JSON.parse(lines[1]!)).toMatchObject({
          bizId: 'biz-2',
          labelResultId: null,
          labelResult: null,
          reviewResultId: null,
          reviewResult: null,
        });
      }
    }
    // 直接调导出服务：缺 datasetVersionId → FAILED
    await h.ctx.db
      .updateTable('label_case')
      .set({ datasetVersionId: null })
      .where('id', '=', caseId)
      .execute();
    await h.mod.exportService.exportCaseResult(caseId, 'csv', 'tester');
    const row = await h.ctx.db
      .selectFrom('label_case')
      .select('ext')
      .where('id', '=', caseId)
      .executeTakeFirstOrThrow();
    expect(
      (row.ext as { lastExport: { status: string; failureReason: string } }).lastExport,
    ).toMatchObject({
      status: 'FAILED',
      failureReason: expect.stringContaining('datasetVersionId'),
    });
  });
});
