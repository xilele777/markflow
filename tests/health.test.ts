import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from './helpers/app.js';

describe('基础端点', () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await createTestHarness();
  });
  afterAll(() => h.close());

  it('GET /api/health → ok，pg/redis 探测通过', async () => {
    const res = await request(h.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      checks: { db: { ok: true }, redis: { ok: true } },
    });
  });

  it('未知路由 → HTTP 404 NOT_FOUND 包络', async () => {
    const res = await request(h.app).post('/api/nope').send({});
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });

  it('响应带 X-Request-Id，且透传客户端提供的值', async () => {
    const res = await request(h.app).get('/api/health').set('X-Request-Id', 'req-abc-123');
    expect(res.headers['x-request-id']).toBe('req-abc-123');
    const generated = await request(h.app).get('/api/health');
    expect(generated.headers['x-request-id']).toBeTruthy();
  });

  it('CORS：白名单来源回显，其它来源不下发 Allow-Origin', async () => {
    const allowed = await request(h.app)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const blocked = await request(h.app)
      .options('/api/auth/login')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
