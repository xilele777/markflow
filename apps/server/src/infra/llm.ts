// OpenAI 兼容 LLM 客户端（对应 Java OpenAiCompatibleLlmClient；后端索引 §6.8）。
// 无状态：baseUrl / apiKey / model 逐次传入。POST {baseUrl}/chat/completions，stream:false；
// 响应同时支持聚合 JSON（choices[0].message.content）与 SSE 分片（data: … 拼接 delta.content）。
// 失败一律抛 LlmError（ServiceError 子类，code 沿用 Java LlmErrorCode），并带 retryable 标记供 AI 执行器分类：
// 超时 / 网络错误 / HTTP 429 / HTTP 5xx 为瞬时错误；配置无效 / 其它 4xx / 响应无法解析为永久错误。
// apiKey 只进 Authorization 头，绝不进异常 message 与日志。
import { defineErrorCodes, ServiceError, type ErrorCode } from './errors.js';

export const LlmErrorCode = defineErrorCodes({
  LLM_CONFIG_INVALID: 'LLM 连接配置无效',
  LLM_REQUEST_INVALID: 'LLM 请求参数无效',
  LLM_TIMEOUT: 'LLM 调用超时',
  LLM_HTTP_ERROR: 'LLM 返回错误状态',
  LLM_CALL_FAILED: 'LLM 调用失败',
  LLM_RESPONSE_INVALID: 'LLM 响应解析失败',
});

const DEFAULT_TIMEOUT_MS = 60_000;
const CHAT_COMPLETIONS_PATH = '/chat/completions';
const ERROR_BODY_MAX_LENGTH = 500;

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 连接 + 读取整体超时；缺省 60s。 */
  timeoutMs?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string | null;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

export class LlmError extends ServiceError {
  readonly retryable: boolean;

  constructor(errorCode: ErrorCode, retryable: boolean, message?: string, cause?: unknown) {
    super(errorCode, message, cause === undefined ? undefined : { cause });
    this.name = 'LlmError';
    this.retryable = retryable;
  }
}

export interface LlmClient {
  chat(config: LlmConfig, request: ChatRequest): Promise<ChatResponse>;
}

export type FetchLike = typeof globalThis.fetch;

function truncate(s: string): string {
  return s.length <= ERROR_BODY_MAX_LENGTH ? s : `${s.slice(0, ERROR_BODY_MAX_LENGTH)}...`;
}

function hasText(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

function textOrNull(v: unknown): string | null {
  return v === undefined || v === null ? null : String(v);
}

function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

export class OpenAiCompatibleLlmClient implements LlmClient {
  constructor(private readonly fetchImpl: FetchLike = globalThis.fetch) {}

  async chat(config: LlmConfig, request: ChatRequest): Promise<ChatResponse> {
    if (!config || !hasText(config.baseUrl) || !hasText(config.apiKey) || !hasText(config.model)) {
      throw new LlmError(LlmErrorCode.LLM_CONFIG_INVALID, false);
    }
    if (!request || !Array.isArray(request.messages) || request.messages.length === 0) {
      throw new LlmError(LlmErrorCode.LLM_REQUEST_INVALID, false);
    }
    const url = `${config.baseUrl.replace(/\/+$/, '')}${CHAT_COMPLETIONS_PATH}`;
    const body: Record<string, unknown> = {
      model: config.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    };
    if (request.temperature !== undefined) body['temperature'] = request.temperature;
    if (request.maxTokens !== undefined) body['max_tokens'] = request.maxTokens;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      if (isAbortError(err)) throw new LlmError(LlmErrorCode.LLM_TIMEOUT, true, undefined, err);
      throw new LlmError(
        LlmErrorCode.LLM_CALL_FAILED,
        true,
        `${LlmErrorCode.LLM_CALL_FAILED.message}（${err instanceof Error ? err.message : String(err)}）`,
        err,
      );
    }

    let text: string;
    try {
      text = await response.text();
    } catch (err) {
      throw new LlmError(LlmErrorCode.LLM_CALL_FAILED, true, undefined, err);
    }
    if (response.status < 200 || response.status >= 300) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new LlmError(
        LlmErrorCode.LLM_HTTP_ERROR,
        retryable,
        `HTTP ${response.status}, body=${truncate(text)}`,
      );
    }
    return parseResponse(text);
  }
}

/** 据体首判别：SSE（data: 前缀）走分片聚合，否则按聚合 JSON。 */
export function parseResponse(body: string): ChatResponse {
  if (!hasText(body)) throw new LlmError(LlmErrorCode.LLM_RESPONSE_INVALID, false, 'empty body');
  return body.trimStart().startsWith('data:') ? parseSse(body) : parseJson(body);
}

function parseJson(body: string): ChatResponse {
  let root: unknown;
  try {
    root = JSON.parse(body);
  } catch {
    throw new LlmError(
      LlmErrorCode.LLM_RESPONSE_INVALID,
      false,
      `unparseable body=${truncate(body)}`,
    );
  }
  const obj = (root ?? {}) as Record<string, unknown>;
  const choices = obj['choices'];
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new LlmError(
      LlmErrorCode.LLM_RESPONSE_INVALID,
      false,
      `missing choices, body=${truncate(body)}`,
    );
  }
  const first = (choices[0] ?? {}) as Record<string, unknown>;
  const message = (first['message'] ?? {}) as Record<string, unknown>;
  const usage = (obj['usage'] ?? {}) as Record<string, unknown>;
  return {
    content: textOrNull(message['content']),
    finishReason: textOrNull(first['finish_reason']),
    promptTokens: intOrNull(usage['prompt_tokens']),
    completionTokens: intOrNull(usage['completion_tokens']),
  };
}

function parseSse(body: string): ChatResponse {
  let content = '';
  let finishReason: string | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let anyChunk = false;
  for (const rawLine of body.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice('data:'.length).trim();
    if (payload === '' || payload === '[DONE]') continue;
    let chunk: unknown;
    try {
      chunk = JSON.parse(payload);
    } catch {
      continue;
    }
    anyChunk = true;
    const obj = (chunk ?? {}) as Record<string, unknown>;
    const choices = obj['choices'];
    if (Array.isArray(choices) && choices.length > 0) {
      const first = (choices[0] ?? {}) as Record<string, unknown>;
      const delta = (first['delta'] ?? {}) as Record<string, unknown>;
      const piece = textOrNull(delta['content']);
      if (piece !== null) content += piece;
      const fr = textOrNull(first['finish_reason']);
      if (fr !== null) finishReason = fr;
    }
    const usage = (obj['usage'] ?? {}) as Record<string, unknown>;
    const pt = intOrNull(usage['prompt_tokens']);
    const ct = intOrNull(usage['completion_tokens']);
    if (pt !== null) promptTokens = pt;
    if (ct !== null) completionTokens = ct;
  }
  if (!anyChunk) {
    throw new LlmError(
      LlmErrorCode.LLM_RESPONSE_INVALID,
      false,
      `no parseable SSE chunk, body=${truncate(body)}`,
    );
  }
  return { content: content === '' ? null : content, finishReason, promptTokens, completionTokens };
}
