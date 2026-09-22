#!/usr/bin/env node
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const apiOnly = process.argv.includes('--api-only');
const username = process.env.LINGSHU_SMOKE_USERNAME;
const password = process.env.LINGSHU_SMOKE_PASSWORD;
const expectedRelease = process.env.LINGSHU_EXPECTED_RELEASE;
if (!username || !password) throw new Error('Set LINGSHU_SMOKE_USERNAME / LINGSHU_SMOKE_PASSWORD (dedicated active account)');
const get = (path, init = {}) => fetch(`${base}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(5000) });

try {
  let healthy = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const response = await get('/api/health');
      const body = await response.json();
      healthy = response.status === 200 && body.success === true && body.data?.status === 'ok' && ['db', 'redis', 'storage', 'queues'].every((name) => body.data?.checks?.[name]?.ok === true);
      if (expectedRelease && body.data?.releaseId !== expectedRelease) healthy = false;
    } catch { /* 启动窗口内重试；不输出可能含凭据的响应。 */ }
    if (healthy) break;
    await delay(2000);
  }
  assert(healthy, 'health not ready');
  console.log('PASS health (db / redis / storage / queues)');
  const unauthenticated = await get('/api/user/getCurrentUser');
  assert.equal(unauthenticated.status, 401, 'anonymous request must be 401');
  assert.equal((await unauthenticated.json()).code, 'UNAUTHORIZED');
  const invalid = await get('/api/user/getCurrentUser', { headers: { Authorization: 'Bearer invalid-smoke-token' } });
  assert.equal(invalid.status, 401, 'invalid token must be 401');
  console.log('PASS unauthenticated / invalid token 401');
  const response = await get('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(response.status, 200, 'login HTTP status');
  const body = await response.json();
  assert(body.success === true && typeof body.data?.token === 'string', 'login rejected');
  const current = await get('/api/user/getCurrentUser', { headers: { Authorization: `Bearer ${body.data.token}` } });
  assert.equal(current.status, 200, 'current user HTTP status');
  const user = await current.json();
  assert(user.success === true && user.data?.username?.toLowerCase() === username.toLowerCase(), 'current user mismatch');
  console.log('PASS login / getCurrentUser');
  if (!apiOnly) {
    if (expectedRelease) {
      const metadata = await get('/release.json');
      assert.equal(metadata.status, 200, 'frontend release metadata status');
      assert.match(metadata.headers.get('cache-control') ?? '', /no-cache|no-store/);
      assert.equal((await metadata.json()).release, expectedRelease, 'frontend release mismatch');
    }
    const index = await get('/index.html');
    assert.equal(index.status, 200, 'index HTTP status');
    assert.match(index.headers.get('cache-control') ?? '', /no-cache|no-store/, 'index must not be cached');
    assert.equal(index.headers.get('x-content-type-options'), 'nosniff');
    const html = await index.text();
    const asset = html.match(/(?:src|href)="(\/assets\/[^"?#]+\.js)"/)?.[1];
    assert(asset, 'missing entry JS');
    const js = await get(asset);
    assert.equal(js.status, 200, 'entry JS status');
    assert.match(js.headers.get('cache-control') ?? '', /immutable/, 'entry JS must be immutable');
    assert.equal(js.headers.get('x-content-type-options'), 'nosniff');
    const route = await get('/notifications');
    assert.equal(route.status, 200, 'SPA deep link status');
    assert.equal(await route.text(), html, 'SPA deep link must return the same index');
    const missingAsset = await get('/assets/smoke-missing.js');
    assert.equal(missingAsset.status, 404, 'missing assets must not return SPA HTML');
    console.log('PASS static assets / cache / security header / SPA fallback');
  }
  console.log('Smoke passed');
} catch (err) {
  console.error(`Smoke failed: ${err.message}`);
  process.exitCode = 1;
}
