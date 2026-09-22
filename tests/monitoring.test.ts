import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminToken,
  bearer,
  createTestHarness,
  createUserAndLogin,
  type TestHarness,
} from './helpers/app.js';
import {
  MonitoringService,
  p75,
  parseWebVital,
  summarize,
} from '../src/modules/monitoring/monitoring.service.js';
import { PermissionService } from '../src/modules/common/permission.js';

describe('monitoring · Web Vitals', () => {
  let h: TestHarness;
  let admin: string;

  beforeAll(async () => {
    h = await createTestHarness();
    admin = await adminToken(h.app);
    await h.ctx.db.deleteFrom('web_vitals').execute();
  });
  afterAll(() => h.close());

  const report = (body: string, contentType = 'text/plain') =>
    request(h.app)
      .post('/api/monitoring/reportWebVitals')
      .set('Content-Type', contentType)
      .send(body);

  it('reportWebVitals：无 Authorization、text/plain 载荷 → 204 且落表', async () => {
    const res = await report(
      JSON.stringify({
        name: 'LCP',
        value: 1234.6,
        rating: 'good',
        id: 'v1-abc',
        navigationType: 'navigate',
        page: '/dataset',
        timestamp: Date.now(),
      }),
    );
    expect(res.status).toBe(204);
    const row = await h.ctx.db
      .selectFrom('web_vitals')
      .selectAll()
      .where('metricId', '=', 'v1-abc')
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      name: 'LCP',
      value: 1235,
      rating: 'good',
      page: '/dataset',
      navigationType: 'navigate',
    });
    expect(row.createTime).toBeGreaterThan(0);
  });

  it('reportWebVitals：application/json 载荷同样接受', async () => {
    const res = await report(
      JSON.stringify({ name: 'CLS', value: 123, rating: 'poor', id: 'v1-json' }),
      'application/json',
    );
    expect(res.status).toBe(204);
    const row = await h.ctx.db
      .selectFrom('web_vitals')
      .select(['name', 'value'])
      .where('metricId', '=', 'v1-json')
      .executeTakeFirst();
    expect(row).toEqual({ name: 'CLS', value: 123 });
  });

  it('reportWebVitals：非白名单指标 / 非 JSON / 负值 → 204 但不落表', async () => {
    const before = await h.ctx.db
      .selectFrom('web_vitals')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow();
    expect((await report(JSON.stringify({ name: 'FID', value: 1 }))).status).toBe(204);
    expect((await report('not json')).status).toBe(204);
    expect((await report(JSON.stringify({ name: 'LCP', value: -1 }))).status).toBe(204);
    expect((await report('')).status).toBe(204);
    const after = await h.ctx.db
      .selectFrom('web_vitals')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow();
    expect(Number(after.n)).toBe(Number(before.n));
  });

  it('reportWebVitals：超过每分钟上限 → 429', async () => {
    const limit = h.ctx.config.rateLimit.webVitalsPerMinute;
    // 用独立 IP 计数（X-Forwarded-For 只有 trust proxy 开启才生效；这里直接清 key 保证从 0 开始）。
    const keys = await h.ctx.redis.keys('rl:webvitals:*');
    if (keys.length) await h.ctx.redis.del(...keys);
    let last = 0;
    for (let i = 0; i < limit + 1; i += 1) {
      last = (await report(JSON.stringify({ name: 'TTFB', value: 1, id: `rl-${i}` }))).status;
    }
    expect(last).toBe(429);
    const again = await report(JSON.stringify({ name: 'TTFB', value: 1 }));
    expect(again.status).toBe(429);
    expect(again.body.code).toBe('TOO_MANY_REQUESTS');
    expect(again.headers['retry-after']).toBeTruthy();
    const keys2 = await h.ctx.redis.keys('rl:webvitals:*');
    if (keys2.length) await h.ctx.redis.del(...keys2);
  });

  it('getWebVitalsSummary：未登录 401；非系统管理员 403', async () => {
    const anon = await request(h.app).post('/api/monitoring/getWebVitalsSummary').send({});
    expect(anon.status).toBe(401);
    const user = await createUserAndLogin(h.ctx, h.app, 'wv');
    const denied = await request(h.app)
      .post('/api/monitoring/getWebVitalsSummary')
      .set('Authorization', bearer(user.token))
      .send({ days: 7 });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
  });

  it('getWebVitalsSummary：系统管理员拿到 p75 / rating 分布 / 趋势', async () => {
    await h.ctx.db.deleteFrom('web_vitals').execute();
    const now = Date.now();
    const rows = [
      { name: 'LCP', value: 1000, rating: 'good', createTime: now - 1000 },
      { name: 'LCP', value: 2000, rating: 'good', createTime: now - 2000 },
      { name: 'LCP', value: 3000, rating: 'needs-improvement', createTime: now - 3000 },
      { name: 'LCP', value: 5000, rating: 'poor', createTime: now - 4000 },
      { name: 'INP', value: 150, rating: 'good', createTime: now - 5000 },
      // 30 天前的样本：7 天窗口不应统计。
      { name: 'INP', value: 9999, rating: 'poor', createTime: now - 30 * 86_400_000 },
    ];
    await h.ctx.db
      .insertInto('web_vitals')
      .values(rows.map((r) => ({ ...r, page: '/x', navigationType: null, metricId: null })))
      .execute();

    const res = await request(h.app)
      .post('/api/monitoring/getWebVitalsSummary')
      .set('Authorization', bearer(admin))
      .send({ days: 7 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.days).toBe(7);
    expect(data.total).toBe(5);
    expect(data.metrics.LCP).toEqual({
      count: 4,
      p75: 3000,
      ratings: { good: 2, 'needs-improvement': 1, poor: 1 },
    });
    expect(data.metrics.INP.count).toBe(1);
    expect(data.trend.length).toBeGreaterThanOrEqual(1);
    expect(data.trend[data.trend.length - 1].LCP).toBe(3000);
    expect(typeof data.updatedAt).toBe('number');

    // 不传 days → 默认 7；days=90 上限；非法 days → DAYS_INVALID。
    const dflt = await request(h.app)
      .post('/api/monitoring/getWebVitalsSummary')
      .set('Authorization', bearer(admin))
      .send({});
    expect(dflt.body.data.days).toBe(7);
    const big = await request(h.app)
      .post('/api/monitoring/getWebVitalsSummary')
      .set('Authorization', bearer(admin))
      .send({ days: 365 });
    expect(big.body.data.days).toBe(90);
    expect(big.body.data.total).toBe(6);
    const bad = await request(h.app)
      .post('/api/monitoring/getWebVitalsSummary')
      .set('Authorization', bearer(admin))
      .send({ days: -1 });
    expect(bad.body).toMatchObject({ success: false, code: 'DAYS_INVALID' });
  });

  it('prune：只保留最近 N 条', async () => {
    await h.ctx.db.deleteFrom('web_vitals').execute();
    const now = Date.now();
    await h.ctx.db
      .insertInto('web_vitals')
      .values(
        Array.from({ length: 12 }, (_, i) => ({
          name: 'FCP',
          value: i,
          rating: null,
          page: null,
          navigationType: null,
          metricId: `p-${i}`,
          createTime: now + i,
        })),
      )
      .execute();
    const service = new MonitoringService({
      db: h.ctx.db,
      logger: h.ctx.logger,
      permissions: new PermissionService(h.ctx.db),
      timeZone: 'Asia/Shanghai',
    });
    const deleted = await service.prune(5);
    expect(deleted).toBe(7);
    const left = await h.ctx.db
      .selectFrom('web_vitals')
      .select('value')
      .orderBy('value', 'asc')
      .execute();
    expect(left.map((r) => r.value)).toEqual([7, 8, 9, 10, 11]);
    expect(await service.prune(5)).toBe(0);
  });
});

describe('monitoring · 纯函数', () => {
  it('parseWebVital：字符串 / 对象 / 截断 / 非法', () => {
    expect(parseWebVital('{"name":"LCP","value":"12.4"}')).toMatchObject({
      name: 'LCP',
      value: 12,
    });
    expect(parseWebVital({ name: 'CLS', value: 5, rating: 'weird' })?.rating).toBeNull();
    expect(parseWebVital({ name: 'CLS', value: 5, page: 'x'.repeat(500) })?.page).toHaveLength(200);
    expect(parseWebVital({ name: 'LCP', value: 1, metricId: 'm1' })?.metricId).toBe('m1');
    expect(parseWebVital({ name: 'NOPE', value: 1 })).toBeNull();
    expect(parseWebVital({ name: 'LCP', value: 'abc' })).toBeNull();
    expect(parseWebVital([1])).toBeNull();
    expect(parseWebVital(null)).toBeNull();
    expect(parseWebVital('   ')).toBeNull();
  });

  it('p75：空 → null；按最近邻取值', () => {
    expect(p75([])).toBeNull();
    expect(p75([5])).toBe(5);
    expect(p75([4, 1, 3, 2])).toBe(3);
    expect(p75([1, 2, 3, 4, 5])).toBe(4);
  });

  it('summarize：按天分桶（时区）', () => {
    const t = Date.UTC(2026, 8, 21, 17, 0, 0); // 北京时间 2026-09-22 01:00
    const rows = [
      { name: 'LCP', value: 100, rating: 'good', createTime: t },
      { name: 'LCP', value: 300, rating: 'poor', createTime: t - 3 * 3_600_000 }, // 北京 09-21 22:00
    ];
    const s = summarize(rows, 7, t - 7 * 86_400_000, 'Asia/Shanghai');
    expect(s.trend.map((p) => p.date)).toEqual(['2026-09-21', '2026-09-22']);
    expect(s.trend[0]!.LCP).toBe(300);
    expect(s.trend[1]!.LCP).toBe(100);
    const u = summarize(rows, 7, 0, 'UTC');
    expect(u.trend.map((p) => p.date)).toEqual(['2026-09-21']);
  });
});
