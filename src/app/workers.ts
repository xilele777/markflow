// 队列消费者与定时器装配：与 API 同进程运行（单机 pm2 部署，规划 0002 §2）。
// main.ts 在监听端口后启动，关停时先停消费者再关服务器；测试按需单独启动某个 worker。
import type { Worker } from 'bullmq';
import { createDatasetParseWorker } from '../modules/dataset/dataset-parse.worker.js';
import { createTaskModule, type TaskModule } from '../modules/task/module.js';
import {
  createCaseExportWorker,
  createTaskCompletedWorker,
  createTaskDispatchedWorker,
  startAutoRecycleScheduler,
} from '../modules/task/task.workers.js';
import type { AppContext } from './context.js';

export interface RunningWorkers {
  /** 等待在手任务完成后关闭（BullMQ close 默认不强杀）。 */
  close(): Promise<void>;
}

export function startWorkers(ctx: AppContext, taskModule?: TaskModule): RunningWorkers {
  const mod = taskModule ?? createTaskModule(ctx);
  const workers: Worker[] = [
    createDatasetParseWorker(ctx),
    createTaskDispatchedWorker(ctx, mod),
    createTaskCompletedWorker(ctx, mod),
    createCaseExportWorker(ctx, mod),
  ];
  const recycler = startAutoRecycleScheduler(ctx, mod);
  const republisher = ctx.outbox.startRepublisher();
  ctx.logger.info({ workers: workers.map((w) => w.name) }, 'queue workers started');
  return {
    async close() {
      await Promise.all([recycler.stop(), republisher.stop()]);
      await Promise.all(workers.map((w) => w.close()));
    },
  };
}
