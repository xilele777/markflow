import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app/create-app.js';
import { Metrics } from '../src/infra/metrics.js';
import { QUEUE_NAMES } from '../src/infra/queue.js';
import { adminToken, createTestHarness, type TestHarness } from './helpers/app.js';
import { caseBody, createCaseOk, createFixture } from './helpers/pipeline.js';

describe('M6 health and metrics', () => {
  let h: TestHarness;
  const secret = 'test-only-metrics-token-0123456789abcdef';
  beforeAll(async () => {
    h = await createTestHarness();
  });
  afterAll(() => h.close());
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const app = () => createApp(h.ctx);

  it('health checks all dependencies and suppresses internal error details', async () => {
    const healthy = await request(app()).get('/api/health');
    expect(healthy.status).toBe(200);
    expect(healthy.body.data.releaseId).toBe(h.ctx.config.server.releaseId);
    for (const dependency of ['db', 'redis', 'storage', 'queues'])
      expect(healthy.body.data.checks[dependency]).toEqual({ ok: true });
    vi.spyOn(h.ctx.storage, 'checkHealth').mockRejectedValue(
      new Error('secret-access-key@internal-host'),
    );
    const failed = await request(app()).get('/api/health');
    expect(failed.status).toBe(503);
    expect(failed.body.data.checks.storage).toEqual({ ok: false, error: 'unavailable' });
    expect(failed.text).not.toContain('secret-access-key');
  });

  it('paused or unavailable queues fail readiness even when Redis PING works', async () => {
    for (const name of Object.values(QUEUE_NAMES)) {
      const spy = vi.spyOn(h.ctx.queues.byName(name)!, 'isPaused').mockResolvedValue(true);
      const response = await request(app()).get('/api/health');
      expect(response.status).toBe(503);
      expect(response.body.data.checks.redis.ok).toBe(true);
      expect(response.body.data.checks.queues.ok).toBe(false);
      spy.mockRestore();
    }
    vi.spyOn(h.ctx.queues.caseExport, 'getJobCounts').mockRejectedValue(new Error('offline'));
    expect((await request(app()).get('/api/health')).status).toBe(503);
  });

  it('readiness times out a stuck dependency', async () => {
    vi.spyOn(h.ctx.storage, 'checkHealth').mockImplementation(() => new Promise(() => {}));
    const start = Date.now();
    const response = await request(app()).get('/api/health');
    expect(response.status).toBe(503);
    expect(Date.now() - start).toBeLessThan(3500);
  });

  it('metrics disabled by default; token required when enabled', async () => {
    h.ctx.config.monitoring.metricsToken = undefined;
    expect((await request(app()).get('/api/metrics')).status).toBe(404);
    h.ctx.config.monitoring.metricsToken = secret;
    expect((await request(app()).get('/api/metrics')).status).toBe(401);
    expect(
      (
        await request(app())
          .get('/api/metrics')
          .set('Authorization', `Bearer ${'x'.repeat(secret.length)}`)
      ).status,
    ).toBe(401);
  });

  it('scrape exports real backlog and bounded route labels; empty queues reset to zero', async () => {
    h.ctx.config.monitoring.metricsToken = secret;
    const application = app();
    const token = await adminToken(application);
    await request(application)
      .get('/api/user/getCurrentUser?private=user-secret')
      .set('Authorization', `Bearer ${token}`);
    await request(application).get('/api/missing-user-secret/123');
    const now = Date.now();
    const row = await h.ctx.db
      .insertInto('mq_outbox')
      .values({
        queue: 'case-export',
        jobName: 'test',
        payload: '{}',
        status: 1,
        attempts: 0,
        nextRetryTime: now,
        createTime: now - 60_000,
        updateTime: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const job = await h.ctx.queues.caseExport.add(
      'm6-metrics',
      { caseId: -1, format: 'jsonl', operator: 'test' },
      { delay: 600_000 },
    );
    const scrape = () =>
      request(application).get('/api/metrics').set('Authorization', `Bearer ${secret}`);
    try {
      const response = await scrape();
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toMatch(/markflow_outbox_pending_messages [1-9]/);
      expect(response.text).toMatch(
        /markflow_queue_jobs\{queue="case-export",state="delayed"\} [1-9]/,
      );
      expect(response.text).toContain('route="/api/user/getCurrentUser"');
      expect(response.text).toContain('route="unmatched"');
      expect(response.text).not.toContain('user-secret');
      expect(response.text).not.toContain(secret);
    } finally {
      await job.remove();
      await h.ctx.db.deleteFrom('mq_outbox').where('id', '=', row.id).execute();
    }
    const response = await scrape();
    expect(response.text).toContain('markflow_queue_jobs{queue="case-export",state="delayed"} 0');
  });

  it('failed collection returns 503 rather than healthy stale metrics', async () => {
    h.ctx.config.monitoring.metricsToken = secret;
    vi.spyOn(h.ctx.queues.datasetParse, 'getJobCounts').mockRejectedValue(
      new Error('secret-redis-error'),
    );
    const response = await request(app())
      .get('/api/metrics')
      .set('Authorization', `Bearer ${secret}`);
    expect(response.status).toBe(503);
    expect(response.text).toBe('metrics unavailable\n');
  });

  it('pool backlog excludes in-hand and finished tasks, includes paused/rework, and resets', async () => {
    const fixture = await createFixture(h.ctx, h.app, 3);
    const gaugeValue = async () => {
      await h.ctx.metrics.refresh(h.ctx);
      const metric = await h.ctx.metrics.registry
        .getSingleMetric('markflow_pool_pending_tasks')!
        .get();
      return metric.values.find((value) => value.labels['stage'] === '2')!.value;
    };
    const baseline = await gaugeValue();
    const caseId = await createCaseOk(
      h.app,
      fixture.labelAdmin.token,
      caseBody(fixture, { preDispatchSize: 1 }),
    );
    // 3 samples -> 1 in hand, 2 still in pool.
    expect(await gaugeValue()).toBe(baseline + 2);
    await h.ctx.db.updateTable('label_case').set({ status: 3 }).where('id', '=', caseId).execute();
    await h.ctx.db
      .updateTable('label_task')
      .set({ status: 5 })
      .where('caseId', '=', caseId)
      .where('status', '=', 1)
      .execute();
    expect(await gaugeValue()).toBe(baseline + 2);
    await h.ctx.db.updateTable('label_case').set({ status: 4 }).where('id', '=', caseId).execute();
    expect(await gaugeValue()).toBe(baseline);
  });

  it('registries are independent and collect attempts using fixed labels', async () => {
    const isolated = new Metrics();
    isolated.ai.inc({ stage: '1', outcome: 'retryable_failure' });
    expect(await isolated.registry.metrics()).toContain(
      'markflow_ai_executions_total{stage="1",outcome="retryable_failure"} 1',
    );
    expect(await h.ctx.metrics.registry.metrics()).not.toContain(
      'markflow_ai_executions_total{stage="1",outcome="retryable_failure"} 1',
    );
    isolated.registry.clear();
  });
});
