import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Metric } from 'web-vitals';

type Handler = (metric: Metric) => void;
const handlers: Record<string, Handler> = {};

vi.mock('web-vitals', () => ({
  onLCP: vi.fn((cb: Handler) => {
    handlers.LCP = cb;
  }),
  onINP: vi.fn((cb: Handler) => {
    handlers.INP = cb;
  }),
  onCLS: vi.fn((cb: Handler) => {
    handlers.CLS = cb;
  }),
  onFCP: vi.fn((cb: Handler) => {
    handlers.FCP = cb;
  }),
  onTTFB: vi.fn((cb: Handler) => {
    handlers.TTFB = cb;
  }),
}));

import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import { initWebVitals, toPayload, WEB_VITALS_ENDPOINT } from './webVitals';

function metric(overrides: Partial<Metric>): Metric {
  return {
    name: 'LCP',
    value: 1234.56,
    rating: 'good',
    delta: 0,
    entries: [],
    id: 'v1-1',
    navigationType: 'navigate',
    ...overrides,
  } as Metric;
}

describe('webVitals', () => {
  const sendBeacon = vi.fn(() => true);

  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeacon,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('非生产环境不注册任何指标', () => {
    vi.stubEnv('PROD', false);
    initWebVitals();
    expect(onLCP).not.toHaveBeenCalled();
    expect(onCLS).not.toHaveBeenCalled();
  });

  it('生产环境注册 LCP / INP / CLS / FCP / TTFB 五项', () => {
    vi.stubEnv('PROD', true);
    initWebVitals();
    expect(onLCP).toHaveBeenCalledTimes(1);
    expect(onINP).toHaveBeenCalledTimes(1);
    expect(onCLS).toHaveBeenCalledTimes(1);
    expect(onFCP).toHaveBeenCalledTimes(1);
    expect(onTTFB).toHaveBeenCalledTimes(1);
  });

  it('指标触发后经 sendBeacon 上报到监控接口，ms 指标取整', () => {
    vi.stubEnv('PROD', true);
    initWebVitals();
    handlers.LCP!(metric({ name: 'LCP', value: 1234.56 }));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [endpoint, body] = sendBeacon.mock.calls[0] as unknown as [string, string];
    expect(endpoint).toBe(WEB_VITALS_ENDPOINT);
    expect(endpoint).toBe('/api/monitoring/reportWebVitals');
    const payload = JSON.parse(body);
    expect(payload.name).toBe('LCP');
    expect(payload.value).toBe(1235);
    expect(payload.rating).toBe('good');
    expect(payload.id).toBe('v1-1');
    expect(payload.navigationType).toBe('navigate');
    expect(typeof payload.page).toBe('string');
    expect(typeof payload.timestamp).toBe('number');
  });

  it('CLS 放大 1000 倍取整', () => {
    expect(toPayload(metric({ name: 'CLS', value: 0.1234 }), '/x').value).toBe(123);
  });

  it('page 只取 pathname', () => {
    expect(toPayload(metric({}), '/dataset/1').page).toBe('/dataset/1');
  });

  it('sendBeacon 不可用时退化为 keepalive fetch', () => {
    vi.stubEnv('PROD', true);
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true });
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    initWebVitals();
    handlers.TTFB!(metric({ name: 'TTFB', value: 80.2 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WEB_VITALS_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string).value).toBe(80);
    vi.unstubAllGlobals();
  });
});
