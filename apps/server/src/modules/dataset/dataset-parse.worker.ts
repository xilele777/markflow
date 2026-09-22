// dataset-parse 队列消费者（对应 Java DatasetVersionParseConsumer）：载荷 {versionId} → DatasetParseService。
// 解析失败在服务内部标记 PARSE_FAILED 并吞掉，所以正常情况下 job 总是 completed；
// 只有基础设施异常（连不上库 / 标记失败）才会让 job 失败并按 attempts 重试。
import type { Worker } from 'bullmq';
import type { AppContext } from '../../app/context.js';
import { createWorker, QUEUE_NAMES, type DatasetParseJob } from '../../infra/queue.js';
import { LabelToolRepository } from '../labeltool/labeltool.repo.js';
import { DatasetParseService } from './dataset-parse.service.js';
import { DatasetSampleRepository } from './dataset-sample.repo.js';
import { DatasetVersionRepository } from './dataset-version.repo.js';
import { DatasetRepository } from './dataset.repo.js';

export function createDatasetParseService(ctx: AppContext): DatasetParseService {
  return new DatasetParseService({
    datasets: new DatasetRepository(ctx.db),
    versions: new DatasetVersionRepository(ctx.db),
    samples: new DatasetSampleRepository(ctx.db),
    labelTools: new LabelToolRepository(ctx.db),
    storage: ctx.storage,
    logger: ctx.logger,
  });
}

export function createDatasetParseWorker(ctx: AppContext): Worker<DatasetParseJob> {
  const service = createDatasetParseService(ctx);
  const worker = createWorker<DatasetParseJob>(
    QUEUE_NAMES.datasetParse,
    async (job) => {
      const versionId = job.data?.versionId;
      if (typeof versionId !== 'number') {
        ctx.logger.warn({ jobId: job.id, data: job.data }, 'dataset-parse job without versionId');
        return;
      }
      await service.parseDatasetVersion(versionId);
    },
    ctx.config,
    { concurrency: 1 },
  );
  worker.on('failed', (job, err) => {
    ctx.logger.error(
      { err, jobId: job?.id, data: job?.data, attemptsMade: job?.attemptsMade },
      'dataset-parse job failed',
    );
  });
  worker.on('error', (err) => ctx.logger.warn({ err }, 'dataset-parse worker error'));
  return worker;
}
