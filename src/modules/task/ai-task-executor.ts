// AI 执行器（对应 Java AiTaskExecutorImpl；规则表 0004 §6）。由 task-dispatched 消费者调用。
// 与 Java 的差异：失败分类——瞬时错误（超时 / 网络 / 429 / 5xx）抛出让 BullMQ 重试，永久错误记录后返回；
// 两类都写 label_task.ext.aiFailure；成功后清除；重复投递时按 task 状态幂等跳过。apiKey 不进日志。
import type { TaskRow } from '../../db/schema.js';
import { ServiceError } from '../../infra/errors.js';
import { LlmError, LlmErrorCode, type LlmClient } from '../../infra/llm.js';
import type { Logger } from '../../infra/logger.js';
import type { AiConfigService } from '../aiconfig/aiconfig.service.js';
import type { DatasetSampleRepository } from '../dataset/dataset-sample.repo.js';
import type { CaseRepository } from './case.repo.js';
import { aiConfigOf, readAssignment, readTaskExt, type AiFailure } from './config.js';
import {
  isReviewActionCode,
  requireStageByCode,
  SampleType,
  TaskStatus,
  TaskType,
} from './enums.js';
import type { TaskRepository } from './task.repo.js';
import type { TaskService } from './task.service.js';

const LLM_TIMEOUT_MS = 120_000;
const RAW_LOG_MAX_LENGTH = 500;
const FAILURE_MESSAGE_MAX_LENGTH = 500;

/** 执行器内部的失败分类：retryable=true 时抛给队列重试。 */
export class AiExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AiExecutionError';
  }
}

export interface AiTaskExecutorDeps {
  tasks: TaskRepository;
  cases: CaseRepository;
  samples: DatasetSampleRepository;
  aiConfigs: AiConfigService;
  llm: LlmClient;
  taskService: TaskService;
  logger: Logger;
}

export type AiExecutionOutcome = 'done' | 'skipped' | 'failed';

export class AiTaskExecutor {
  constructor(private readonly deps: AiTaskExecutorDeps) {}

  /**
   * 执行一条 AI 任务。attempt 为当前尝试次数（从 1 起），写入失败记录。
   * 返回 'skipped'（无需执行）/ 'done' / 'failed'（永久失败已记录）；瞬时失败抛 AiExecutionError(retryable)。
   */
  async execute(taskId: number, attempt = 1): Promise<AiExecutionOutcome> {
    const task = await this.deps.tasks.selectById(taskId);
    if (!task || (task.taskType !== TaskType.AI_LABEL && task.taskType !== TaskType.AI_REVIEW)) {
      this.deps.logger.warn({ taskId }, 'ai-task skipped: missing or not AI type');
      return 'skipped';
    }
    if (task.status === TaskStatus.DONE) {
      this.deps.logger.info({ taskId }, 'ai-task skipped: already done');
      return 'skipped';
    }
    if (task.status === TaskStatus.PENDING_DISPATCH) {
      this.deps.logger.info({ taskId, status: task.status }, 'ai-task skipped: not in hand');
      return 'skipped';
    }
    try {
      await this.run(task);
      await this.clearFailure(task);
      this.deps.logger.info({ taskId, taskType: task.taskType }, 'ai-task done');
      return 'done';
    } catch (err) {
      const failure = classify(err);
      await this.recordFailure(task, failure, attempt);
      this.deps.logger.error(
        { err, taskId, taskType: task.taskType, code: failure.code, retryable: failure.retryable },
        'ai-task failed',
      );
      if (failure.retryable) throw failure;
      return 'failed';
    }
  }

  private async run(task: TaskRow): Promise<void> {
    const caseRow = await this.deps.cases.selectById(task.caseId);
    if (!caseRow) throw new AiExecutionError('CASE_NOT_FOUND', 'case 不存在', false);
    const stage = requireStageByCode(task.taskType);
    const aiCode = aiConfigOf(readAssignment(caseRow.assignmentConfig), stage)?.aiCode ?? null;
    if (!aiCode) throw new AiExecutionError('AI_CODE_MISSING', '未配置 aiCode', false);
    const aiConfig = await this.deps.aiConfigs.getAiConfigByCode(aiCode);
    if (!aiConfig)
      throw new AiExecutionError('AI_CONFIG_NOT_FOUND', `AI 配置不存在: ${aiCode}`, false);
    const sample = await this.deps.samples.selectById(task.dataSampleId);
    if (!sample) throw new AiExecutionError('SAMPLE_NOT_FOUND', '源样本不存在', false);

    let userText: string;
    if (task.taskType === TaskType.AI_LABEL) {
      userText = JSON.stringify(sample.sampleDataJson ?? null);
    } else {
      const versionId = caseRow.labelResultDatasetVersionId;
      const labelResult =
        versionId === null
          ? undefined
          : await this.deps.samples.selectByVersionAndBizId(versionId, String(task.dataSampleId));
      if (!labelResult) {
        throw new AiExecutionError('LABEL_RESULT_NOT_FOUND', '待审核的标注结果不存在', false);
      }
      userText = JSON.stringify({
        inputData: sample.sampleDataJson ?? null,
        labelResult: labelResult.sampleDataJson ?? null,
      });
    }

    this.deps.logger.info(
      { taskId: task.id, taskType: task.taskType, aiCode, model: aiConfig.model },
      'ai-task calling llm',
    );
    const response = await this.deps.llm.chat(
      {
        baseUrl: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        timeoutMs: LLM_TIMEOUT_MS,
      },
      {
        messages: [
          { role: 'system', content: aiConfig.prompt },
          { role: 'user', content: userText },
        ],
      },
    );
    const raw = response.content;
    if (!raw || raw.trim() === '') {
      throw new AiExecutionError(
        LlmErrorCode.LLM_RESPONSE_INVALID.code,
        `LLM 返回为空（finishReason=${response.finishReason ?? '-'}）`,
        false,
      );
    }
    const parsed = parseJsonOrNull(raw);
    if (parsed === undefined) {
      throw new AiExecutionError(
        LlmErrorCode.LLM_RESPONSE_INVALID.code,
        `LLM 输出不是合法 JSON: ${truncate(raw)}`,
        false,
      );
    }

    if (task.taskType === TaskType.AI_LABEL) {
      await this.deps.taskService.saveTaskResultInternal(task, SampleType.ANNOTATION, parsed);
      await this.deps.taskService.submitLabelTaskInternal(task);
      return;
    }
    const obj = (parsed ?? {}) as Record<string, unknown>;
    const action = obj['reviewAction'];
    if (!isReviewActionCode(action)) {
      throw new AiExecutionError(
        'REVIEW_ACTION_INVALID',
        `AI 预审输出 reviewAction 非法: ${truncate(JSON.stringify(parsed))}`,
        false,
      );
    }
    const comment = obj['reviewComment'];
    await this.deps.taskService.submitReviewTaskInternal(
      task,
      action,
      comment === undefined || comment === null ? null : String(comment),
    );
  }

  private async recordFailure(task: TaskRow, failure: AiExecutionError, attempt: number) {
    const ext = readTaskExt(task.ext);
    const record: AiFailure = {
      code: failure.code,
      message: truncate(failure.message, FAILURE_MESSAGE_MAX_LENGTH),
      attempts: attempt,
      retryable: failure.retryable,
      failedAt: Date.now(),
    };
    try {
      await this.deps.tasks.updateExt(task.id, { ...ext, aiFailure: record }, Date.now());
    } catch (err) {
      this.deps.logger.error({ err, taskId: task.id }, 'ai-task: recording failure failed');
    }
  }

  private async clearFailure(task: TaskRow) {
    const ext = readTaskExt(task.ext);
    if (ext.aiFailure === undefined || ext.aiFailure === null) return;
    delete ext.aiFailure;
    await this.deps.tasks.updateExt(task.id, ext, Date.now());
  }
}

/** 任何异常 → AiExecutionError：LlmError 按其 retryable；业务 ServiceError 永久；其它（库不可用等）视为瞬时。 */
export function classify(err: unknown): AiExecutionError {
  if (err instanceof AiExecutionError) return err;
  if (err instanceof LlmError)
    return new AiExecutionError(err.code, err.message, err.retryable, err);
  if (err instanceof ServiceError) return new AiExecutionError(err.code, err.message, false, err);
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return new AiExecutionError('SYSTEM_ERROR', message, true, err);
}

/** 剥 ``` 围栏后 JSON.parse；失败返回 undefined。 */
export function parseJsonOrNull(raw: string): unknown {
  let t = raw.trim();
  if (t.startsWith('```')) {
    const nl = t.indexOf('\n');
    t = nl >= 0 ? t.slice(nl + 1) : '';
    if (t.endsWith('```')) t = t.slice(0, -3);
    t = t.trim();
  }
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

function truncate(s: string, max = RAW_LOG_MAX_LENGTH): string {
  return s.length <= max ? s : `${s.slice(0, max)}...`;
}
