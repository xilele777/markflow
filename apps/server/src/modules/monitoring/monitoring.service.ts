// 前端性能监控：Core Web Vitals 采集与汇总（M4，规划 0002 §3）。
// 上报接口公开（sendBeacon 不带 Authorization）、独立限流、白名单校验后落表；汇总仅系统管理员。
import type { Db } from '../../infra/db.js';
import type { Logger } from '../../infra/logger.js';
import { ServiceError } from '../../infra/errors.js';
import type { WebVitalsRow } from '../../db/schema.js';
import { PermissionService } from '../common/permission.js';
import { MonitoringErrorCode } from './error-codes.js';

export const VITAL_NAMES = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;
export type VitalName = (typeof VITAL_NAMES)[number];
const VITAL_NAME_SET: ReadonlySet<string> = new Set(VITAL_NAMES);

export const RATINGS = ['good', 'needs-improvement', 'poor'] as const;
export type Rating = (typeof RATINGS)[number];
const RATING_SET: ReadonlySet<string> = new Set(RATINGS);

/** 表内最多保留的样本数；每 PRUNE_EVERY 次写入检查一次。 */
export const MAX_ROWS = 50_000;
const PRUNE_EVERY = 500;
const MAX_PAGE_LENGTH = 200;
const MAX_STRING_LENGTH = 32;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 7;
const DAY_MS = 86_400_000;

export interface WebVitalInput {
  name: VitalName;
  value: number;
  rating: Rating | null;
  page: string | null;
  navigationType: string | null;
  metricId: string | null;
}

/** 解析并校验 sendBeacon 载荷（text/plain JSON 或已解析对象）；不合法返回 null（接口静默 204）。 */
export function parseWebVital(body: unknown): WebVitalInput | null {
  let raw: unknown = body;
  if (typeof body === 'string') {
    if (!body.trim()) return null;
    try {
      raw = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== 'string' || !VITAL_NAME_SET.has(o.name)) return null;
  const value = Number(o.value);
  if (!Number.isFinite(value) || value < 0) return null;
  const str = (v: unknown, max: number): string | null =>
    typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;
  const rating =
    typeof o.rating === 'string' && RATING_SET.has(o.rating) ? (o.rating as Rating) : null;
  return {
    name: o.name as VitalName,
    value: Math.round(value),
    rating,
    page: str(o.page, MAX_PAGE_LENGTH),
    navigationType: str(o.navigationType, MAX_STRING_LENGTH),
    metricId: str(o.id ?? o.metricId, 64),
  };
}

export interface MetricSummary {
  count: number;
  p75: number | null;
  ratings: Record<Rating, number>;
}

export interface WebVitalsSummary {
  days: number;
  since: number;
  total: number;
  metrics: Partial<Record<VitalName, MetricSummary>>;
  /** 按天（服务器时区，YYYY-MM-DD）各指标 p75。 */
  trend: Array<{ date: string } & Partial<Record<VitalName, number | null>>>;
  updatedAt: number;
}

export function p75(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(0.75 * (sorted.length - 1))] ?? null;
}

function dayKey(ms: number, timeZone: string): string {
  // en-CA 的日期格式即 YYYY-MM-DD。
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

export function summarize(
  rows: Pick<WebVitalsRow, 'name' | 'value' | 'rating' | 'createTime'>[],
  days: number,
  since: number,
  timeZone: string,
): WebVitalsSummary {
  const metricAcc = new Map<VitalName, { values: number[]; ratings: Record<Rating, number> }>();
  const dayAcc = new Map<string, Partial<Record<VitalName, number[]>>>();
  for (const row of rows) {
    const name = row.name as VitalName;
    let m = metricAcc.get(name);
    if (!m) {
      m = { values: [], ratings: { good: 0, 'needs-improvement': 0, poor: 0 } };
      metricAcc.set(name, m);
    }
    m.values.push(row.value);
    if (row.rating && RATING_SET.has(row.rating)) m.ratings[row.rating as Rating] += 1;

    const day = dayKey(row.createTime, timeZone);
    const bucket = dayAcc.get(day) ?? {};
    (bucket[name] ??= []).push(row.value);
    dayAcc.set(day, bucket);
  }
  const metrics: WebVitalsSummary['metrics'] = {};
  for (const [name, m] of metricAcc) {
    metrics[name] = { count: m.values.length, p75: p75(m.values), ratings: m.ratings };
  }
  const trend = [...dayAcc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, bucket]) => {
      const point: WebVitalsSummary['trend'][number] = { date };
      for (const [name, values] of Object.entries(bucket)) {
        point[name as VitalName] = p75(values as number[]);
      }
      return point;
    });
  return { days, since, total: rows.length, metrics, trend, updatedAt: Date.now() };
}

export interface MonitoringServiceDeps {
  db: Db;
  logger: Logger;
  permissions: PermissionService;
  timeZone: string;
}

export class MonitoringService {
  private insertCounter = 0;

  constructor(private readonly deps: MonitoringServiceDeps) {}

  /** 落一条样本；失败只记日志，不影响上报方。 */
  async recordWebVital(input: WebVitalInput): Promise<void> {
    const { db, logger } = this.deps;
    try {
      await db
        .insertInto('web_vitals')
        .values({
          name: input.name,
          value: input.value,
          rating: input.rating,
          page: input.page,
          navigationType: input.navigationType,
          metricId: input.metricId,
          createTime: Date.now(),
        })
        .execute();
      this.insertCounter += 1;
      if (this.insertCounter % PRUNE_EVERY === 0) await this.prune();
    } catch (err) {
      logger.warn({ err }, 'web-vitals persist skipped');
    }
  }

  /** 只保留最近 MAX_ROWS 条。 */
  async prune(keep = MAX_ROWS): Promise<number> {
    const { db } = this.deps;
    const boundary = await db
      .selectFrom('web_vitals')
      .select('id')
      .orderBy('id', 'desc')
      .offset(keep)
      .limit(1)
      .executeTakeFirst();
    if (!boundary) return 0;
    const result = await db
      .deleteFrom('web_vitals')
      .where('id', '<=', boundary.id)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }

  /** 最近 days 天的汇总；仅系统管理员。 */
  async getWebVitalsSummary(userId: number, daysInput: unknown): Promise<WebVitalsSummary> {
    const { db, permissions, timeZone } = this.deps;
    await permissions.checkIsSystemAdmin(userId);
    const n = Number(daysInput);
    const days = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_DAYS) : DEFAULT_DAYS;
    if (daysInput != null && daysInput !== '' && !(Number.isFinite(n) && n > 0)) {
      throw ServiceError.of(MonitoringErrorCode.DAYS_INVALID);
    }
    const since = Date.now() - days * DAY_MS;
    const rows = await db
      .selectFrom('web_vitals')
      .select(['name', 'value', 'rating', 'createTime'])
      .where('createTime', '>=', since)
      .orderBy('createTime', 'asc')
      .limit(MAX_ROWS)
      .execute();
    return summarize(rows, days, since, timeZone);
  }
}
