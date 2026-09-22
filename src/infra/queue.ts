// BullMQ 队列（对应 Java RocketMQ 的四个 topic，后端索引 §6.6）。
// M2 先接 dataset-parse；task-dispatched / task-completed / case-export 由 M3 追加到 QUEUE_NAMES 与 Queues。
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
} as const;

export interface DatasetParseJob {
  versionId: number;
}

export interface Queues {
  datasetParse: Queue<DatasetParseJob>;
  /** 关闭全部生产者连接。 */
  closeAll(): Promise<void>;
}

/** 解析任务：成功即删；失败保留最近 1000 条便于排查；基础设施级异常（库 / 对象存储不可用）重试 3 次。 */
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
  const datasetParse = new Queue<DatasetParseJob>(QUEUE_NAMES.datasetParse, {
    connection,
    prefix: config.queue.prefix,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return {
    datasetParse,
    async closeAll() {
      await datasetParse.close();
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
