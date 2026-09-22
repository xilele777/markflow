// 队列消费者装配：与 API 同进程运行（单机 pm2 部署，规划 0002 §2）。
// main.ts 在监听端口后启动，关停时先停消费者再关服务器；测试按需单独启动某个 worker。
import type { Worker } from 'bullmq';
import { createDatasetParseWorker } from '../modules/dataset/dataset-parse.worker.js';
import type { AppContext } from './context.js';

export interface RunningWorkers {
  /** 等待在手任务完成后关闭（BullMQ close 默认不强杀）。 */
  close(): Promise<void>;
}

export function startWorkers(ctx: AppContext): RunningWorkers {
  const workers: Worker[] = [createDatasetParseWorker(ctx)];
  ctx.logger.info({ workers: workers.map((w) => w.name) }, 'queue workers started');
  return {
    async close() {
      await Promise.all(workers.map((w) => w.close()));
    },
  };
}
