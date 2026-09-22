// BullMQ 队列（对应 Java RocketMQ 的四个 topic，后端索引 §6.6；载荷字段与 Java 事件类一致）。
// 生产者统一经 infra/outbox.ts 投递（事务内落 mq_outbox 行、提交后 add），消费者见各模块 *.worker.ts。
// 生产者 Queue 与消费者 Worker 各自持有 Redis 连接（BullMQ 要求 Worker 连接 maxRetriesPerRequest=null）；
// 所有键带 LINGSHU_QUEUE_PREFIX 前缀，测试用另一个前缀隔离。
import {
  Queue,
  Worker,
  type ConnectionOptions,
  type JobsOptions,
  type Processor,
  type WorkerOptions,
} from 'bullmq';
import type { AppConfig } from './config.js';

export const QUEUE_NAMES = {
  datasetParse: 'dataset-parse',
  taskDispatched: 'task-dispatched',
  taskCompleted: 'task-completed',
  caseExport: 'case-export',
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface DatasetParseJob {
  versionId: number;
}

/** 对应 Java TaskDispatchedEvent：派发后逐条发出，AI 类型触发执行器。 */
export interface TaskDispatchedJob {
  caseId: number;
  taskId: number;
  taskType: number;
  annotator: string;
  dataSampleId: number;
  dispatchTime: number;
}

/** 对应 Java TaskCompletedEvent：nextStageType 为 null 表示末阶段。 */
export interface TaskCompletedJob {
  caseId: number;
  taskId: number;
  dataSampleId: number;
  currentStageType: string;
  nextStageType: string | null;
  annotator: string | null;
  completedTime: number;
}

/** 对应 Java CaseExportEvent。 */
export interface CaseExportJob {
  caseId: number;
  format: string;
  operator: string;
}

export interface Queues {
  datasetParse: Queue<DatasetParseJob>;
  taskDispatched: Queue<TaskDispatchedJob>;
  taskCompleted: Queue<TaskCompletedJob>;
  caseExport: Queue<CaseExportJob>;
  /** 按队列名取生产者（outbox 投递用）。 */
  byName(name: string): Queue | undefined;
  /** 关闭全部生产者连接。 */
  closeAll(): Promise<void>;
}

/** 成功即删；失败保留最近 1000 条便于排查；基础设施级异常（库 / 对象存储 / LLM 瞬时错误）重试 3 次。 */
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: { count: 1000 },
};

export function queueConnectionOptions(
  redis: AppConfig['redis'],
  role: 'producer' | 'worker',
): ConnectionOptions {
  return {
    host: redis.host,
    port: redis.port,
    password: redis.password,
    // Worker 用阻塞命令（BRPOPLPUSH 等），BullMQ 要求不限制重试次数。
    maxRetriesPerRequest: role === 'worker' ? null : 3,
    enableOfflineQueue: true,
  };
}

export function createQueues(config: AppConfig): Queues {
  const connection = queueConnectionOptions(config.redis, 'producer');
  const make = <T>(name: QueueName) =>
    new Queue<T>(name, {
      connection,
      prefix: config.queue.prefix,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  const datasetParse = make<DatasetParseJob>(QUEUE_NAMES.datasetParse);
  const taskDispatched = make<TaskDispatchedJob>(QUEUE_NAMES.taskDispatched);
  const taskCompleted = make<TaskCompletedJob>(QUEUE_NAMES.taskCompleted);
  const caseExport = make<CaseExportJob>(QUEUE_NAMES.caseExport);
  const all: Record<string, Queue> = {
    [QUEUE_NAMES.datasetParse]: datasetParse as Queue,
    [QUEUE_NAMES.taskDispatched]: taskDispatched as Queue,
    [QUEUE_NAMES.taskCompleted]: taskCompleted as Queue,
    [QUEUE_NAMES.caseExport]: caseExport as Queue,
  };
  return {
    datasetParse,
    taskDispatched,
    taskCompleted,
    caseExport,
    byName: (name) => all[name],
    async closeAll() {
      await Promise.all(Object.values(all).map((q) => q.close()));
    },
  };
}

export function createWorker<T>(
  name: string,
  processor: Processor<T>,
  config: AppConfig,
  options: Omit<WorkerOptions, 'connection' | 'prefix'> = {},
): Worker<T> {
  return new Worker<T>(name, processor, {
    connection: queueConnectionOptions(config.redis, 'worker'),
    prefix: config.queue.prefix,
    concurrency: 1,
    ...options,
  });
}

/** 清空某队列的全部键（测试前置用）。 */
export async function obliterateQueue(config: AppConfig, name: string): Promise<void> {
  const queue = new Queue(name, {
    connection: queueConnectionOptions(config.redis, 'producer'),
    prefix: config.queue.prefix,
  });
  try {
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
  }
}
