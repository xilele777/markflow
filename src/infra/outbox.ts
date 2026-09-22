// 事务性发件箱（规则表 0004 §9）：业务事务内 enqueueTx 落 mq_outbox 行，事务提交后 deliver 投递到 BullMQ，
// 成功即删行；投递失败记 last_error 并按 next_retry_time 由 republisher 定时重投。
// jobId 缺省为 outbox-<行 id>（全局唯一：removeOnFail 保留的失败 job 不会让同 id 的新 job 被静默忽略）。
// 消费者必须幂等：同一行可能被「提交后投递」与「定时重投」各投一次（BullMQ 同 jobId 在队列内去重，出队后不去重）。
import type { Db } from './db.js';
import type { Logger } from './logger.js';
import type { QueueName, Queues } from './queue.js';

export const OUTBOX_STATUS_PENDING = 1;
const RETRY_DELAY_MS = 30_000;
const REPUBLISH_BATCH = 100;
const LAST_ERROR_MAX_LENGTH = 1024;

export interface OutboxMessage {
  queue: QueueName;
  jobName: string;
  /** 缺省 outbox-<id>；dataset-parse 沿用 version-<versionId>。 */
  jobId?: string;
  payload: unknown;
}

export interface OutboxDeps {
  db: Db;
  queues: Queues;
  logger: Logger;
}

export interface OutboxRepublisher {
  stop(): Promise<void>;
}

function describe(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.length <= LAST_ERROR_MAX_LENGTH ? text : text.slice(0, LAST_ERROR_MAX_LENGTH);
}

export class OutboxService {
  constructor(private readonly deps: OutboxDeps) {}

  /** 事务内写入一行（用事务句柄 trx），返回行 id；调用方在事务提交后调用 deliver。 */
  async enqueueTx(trx: Db, message: OutboxMessage): Promise<number> {
    const now = Date.now();
    const row = await trx
      .insertInto('mq_outbox')
      .values({
        queue: message.queue,
        jobName: message.jobName,
        jobId: message.jobId ?? null,
        payload: JSON.stringify(message.payload ?? null),
        status: OUTBOX_STATUS_PENDING,
        attempts: 0,
        nextRetryTime: now,
        lastError: null,
        createTime: now,
        updateTime: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** 非事务场景：直接落行并投递。 */
  async publish(message: OutboxMessage): Promise<void> {
    const id = await this.enqueueTx(this.deps.db, message);
    await this.deliver([id]);
  }

  /** 投递给定行；任何失败只记日志，不向调用方抛出（业务已提交，不能因投递失败而失败）。 */
  async deliver(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;
    let rows;
    try {
      rows = await this.deps.db
        .selectFrom('mq_outbox')
        .selectAll()
        .where('id', 'in', [...ids])
        .where('status', '=', OUTBOX_STATUS_PENDING)
        .execute();
    } catch (err) {
      this.deps.logger.error({ err, ids }, 'outbox: reading rows for delivery failed');
      return;
    }
    for (const row of rows) await this.deliverRow(row);
  }

  /** 扫描到期的待投递行重投；返回处理条数。 */
  async republishPending(limit = REPUBLISH_BATCH): Promise<number> {
    const rows = await this.deps.db
      .selectFrom('mq_outbox')
      .selectAll()
      .where('status', '=', OUTBOX_STATUS_PENDING)
      .where('nextRetryTime', '<=', Date.now())
      .orderBy('id')
      .limit(limit)
      .execute();
    for (const row of rows) await this.deliverRow(row);
    return rows.length;
  }

  startRepublisher(intervalMs = RETRY_DELAY_MS): OutboxRepublisher {
    let running: Promise<unknown> = Promise.resolve();
    const timer = setInterval(() => {
      running = this.republishPending().catch((err) =>
        this.deps.logger.error({ err }, 'outbox: republish scan failed'),
      );
    }, intervalMs);
    timer.unref();
    return {
      async stop() {
        clearInterval(timer);
        await running;
      },
    };
  }

  private async deliverRow(row: {
    id: number;
    queue: string;
    jobName: string;
    jobId: string | null;
    payload: unknown;
    attempts: number;
  }): Promise<void> {
    const queue = this.deps.queues.byName(row.queue);
    const jobId = row.jobId ?? `outbox-${row.id}`;
    try {
      if (!queue) throw new Error(`unknown queue ${row.queue}`);
      await queue.add(row.jobName, row.payload, { jobId });
      await this.deps.db.deleteFrom('mq_outbox').where('id', '=', row.id).execute();
    } catch (err) {
      const now = Date.now();
      this.deps.logger.error(
        { err, outboxId: row.id, queue: row.queue, jobId, attempts: row.attempts + 1 },
        'outbox: delivery failed; will retry',
      );
      try {
        await this.deps.db
          .updateTable('mq_outbox')
          .set({
            attempts: row.attempts + 1,
            lastError: describe(err),
            nextRetryTime: now + RETRY_DELAY_MS,
            updateTime: now,
          })
          .where('id', '=', row.id)
          .execute();
      } catch (inner) {
        this.deps.logger.error({ err: inner, outboxId: row.id }, 'outbox: marking retry failed');
      }
    }
  }
}
