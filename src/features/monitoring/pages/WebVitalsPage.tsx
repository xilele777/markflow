// 前端性能（Web Vitals 汇总，仅系统管理员）。数据来自生产前端 sendBeacon 上报的样本。
// 指标卡：p75 + 好 / 待改进 / 差分布；趋势表：按天各指标 p75。阈值参考 web.dev Core Web Vitals。
import { useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DataTable,
  EmptyState,
  ErrorState,
  FilterSelect,
  LoadingState,
  SectionCard,
  Tag,
  Toolbar,
  type ColumnDef,
  type FilterOption,
} from '@/shared/components';
import { STATUS } from '@/shared/constants';
import { formatDateTime, formatNumber } from '@/shared/utils/format';
import { palette, fonts } from '@/app/theme';
import { getWebVitalsSummary } from '../api';
import type { MetricSummary, VitalName, WebVitalsSummary } from '../types';

const DAYS_OPTIONS: FilterOption<number>[] = [
  { label: '最近 1 天', value: 1 },
  { label: '最近 7 天', value: 7 },
  { label: '最近 30 天', value: 30 },
  { label: '最近 90 天', value: 90 },
];

/** 指标顺序与说明；good / poor 阈值取自 web.dev（CLS 存的是 ×1000）。 */
const METRICS: {
  name: VitalName;
  title: string;
  desc: string;
  unit: string;
  good: number;
  poor: number;
}[] = [
  { name: 'LCP', title: 'LCP', desc: '最大内容绘制', unit: 'ms', good: 2500, poor: 4000 },
  { name: 'INP', title: 'INP', desc: '交互到下次绘制', unit: 'ms', good: 200, poor: 500 },
  { name: 'CLS', title: 'CLS', desc: '累计布局偏移（×1000）', unit: '', good: 100, poor: 250 },
  { name: 'FCP', title: 'FCP', desc: '首次内容绘制', unit: 'ms', good: 1800, poor: 3000 },
  { name: 'TTFB', title: 'TTFB', desc: '首字节时间', unit: 'ms', good: 800, poor: 1800 },
];

function toneOf(value: number | null, good: number, poor: number) {
  if (value == null) return STATUS.idle;
  if (value <= good) return STATUS.done;
  if (value <= poor) return STATUS.partial;
  return STATUS.failed;
}

export default function WebVitalsPage() {
  const [days, setDays] = useState(7);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['monitoring', 'webVitals', days],
    queryFn: () => getWebVitalsSummary(days),
  });

  return (
    <>
      <Toolbar>
        <FilterSelect<number>
          label="时间范围"
          value={days}
          options={DAYS_OPTIONS}
          allLabel="最近 7 天"
          onChange={(v) => setDays(v ?? 7)}
        />
      </Toolbar>
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState message="性能数据加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : data.total === 0 ? (
        <EmptyState description="所选时间范围内没有性能样本（仅生产构建的前端会上报）" />
      ) : (
        <Summary data={data} />
      )}
    </>
  );
}

function Summary({ data }: { data: WebVitalsSummary }) {
  const columns: ColumnDef<WebVitalsSummary['trend'][number]>[] = [
    { key: 'date', label: '日期', width: 130, mono: true },
    ...METRICS.map<ColumnDef<WebVitalsSummary['trend'][number]>>((m) => ({
      key: m.name,
      label: `${m.title} p75`,
      mono: true,
      align: 'right',
      render: (row) => {
        const v = row[m.name];
        return v == null ? '—' : formatNumber(v);
      },
    })),
  ];
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
        {METRICS.map((m) => (
          <MetricCard key={m.name} meta={m} summary={data.metrics[m.name]} />
        ))}
      </div>
      <SectionCard
        title="按天趋势（p75）"
        desc={`共 ${formatNumber(data.total)} 条样本 · 更新于 ${formatDateTime(data.updatedAt)}`}
      >
        <DataTable columns={columns} data={data.trend} rowKey="date" />
      </SectionCard>
    </>
  );
}

function MetricCard({
  meta,
  summary,
}: {
  meta: (typeof METRICS)[number];
  summary: MetricSummary | undefined;
}) {
  const p75 = summary?.p75 ?? null;
  const tone = toneOf(p75, meta.good, meta.poor);
  const ratings = summary?.ratings ?? { good: 0, 'needs-improvement': 0, poor: 0 };
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 15, color: palette.text }}
        >
          {meta.title}
        </span>
        <Tag tone={tone}>
          {p75 == null
            ? '无数据'
            : tone.label === '已完成'
              ? '良好'
              : tone.label === '部分成功'
                ? '待改进'
                : '差'}
        </Tag>
      </div>
      <div style={{ fontSize: 12, color: palette.weak, marginTop: 2 }}>{meta.desc}</div>
      <div
        style={{
          marginTop: 12,
          fontFamily: fonts.mono,
          fontSize: 26,
          fontWeight: 600,
          color: palette.text,
        }}
      >
        {p75 == null ? '—' : formatNumber(p75)}
        {p75 != null && meta.unit && (
          <span style={{ fontSize: 12, color: palette.weak, marginLeft: 4 }}>{meta.unit}</span>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: palette.sub, fontFamily: fonts.mono }}>
        样本 {formatNumber(summary?.count ?? 0)} · 好 {ratings.good} / 改{' '}
        {ratings['needs-improvement']} / 差 {ratings.poor}
      </div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.hairline}`,
  borderRadius: 7,
  padding: '14px 16px',
  minWidth: 0,
};
