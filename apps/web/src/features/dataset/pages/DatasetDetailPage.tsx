// 数据集详情（《页面模板.md》二：头卡 + 版本列表，行操作开样本预览 Drawer）。对齐 getDatasetDetail / getVersionSamplePreview。
import { useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusOutlined } from '@ant-design/icons';
import {
  Btn,
  DataTable,
  DetailHeaderCard,
  Drawer,
  EmptyState,
  ErrorState,
  LoadingState,
  PageBackHeader,
  Tag,
  TextLink,
  type ColumnDef,
  type MetaField,
} from '@/shared/components';
import { UPLOAD_STATUS, metaOf } from '@/shared/constants';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import { palette, fonts } from '@/app/theme';
import { STATUS } from '@/shared/constants/tones';
import { getDatasetDetail, getVersionSamplePreview } from '../api';
import type { DatasetVersion } from '../types';

/** 解析中（UPLOAD_STATUS）。 */
const UPLOAD_STATUS_PARSING = 1;
const PARSE_POLL_INTERVAL_MS = 3000;

export default function DatasetDetailPage() {
  const { id } = useParams();
  const datasetId = Number(id);
  const navigate = useNavigate();
  const [previewVersion, setPreviewVersion] = useState<DatasetVersion | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dataset', 'detail', datasetId],
    queryFn: () => getDatasetDetail(datasetId),
    enabled: Number.isFinite(datasetId),
    // 有版本仍在解析中（uploadStatus=1）时每 3s 轮询，解析完成 / 失败后自动停。
    refetchInterval: (query) =>
      query.state.data?.versions.some((v) => v.uploadStatus === UPLOAD_STATUS_PARSING)
        ? PARSE_POLL_INTERVAL_MS
        : false,
  });

  const columns: ColumnDef<DatasetVersion>[] = [
    { key: 'versionNumber', label: '版本', width: 80, mono: true, render: (v) => `v${v.versionNumber}` },
    { key: 'versionDesc', label: '描述', flex: true, render: (v) => v.versionDesc || '—' },
    {
      key: 'uploadStatus',
      label: '状态',
      width: 110,
      render: (v) => {
        const m = metaOf(UPLOAD_STATUS, v.uploadStatus);
        return <Tag tone={m.tone}>{m.label}</Tag>;
      },
    },
    {
      key: 'sampleCount',
      label: '样本数',
      width: 100,
      mono: true,
      render: (v) => (v.uploadStatus === 2 ? String(v.sampleCount) : '—'),
    },
    { key: 'creator', label: '创建人', width: 100 },
    { key: 'createTime', label: '创建时间', width: 124, render: (v) => formatDate(v.createTime) },
    {
      key: 'op',
      label: '操作',
      width: 96,
      align: 'right',
      render: (v) => <TextLink onClick={() => setPreviewVersion(v)}>预览样本</TextLink>,
    },
  ];

  const meta: MetaField[] = data
    ? [
        { label: '描述', value: data.datasetDesc || '—' },
        { label: '标注工具', value: data.labelToolCode, mono: true },
        { label: '最新版本', value: `v${data.latestVersionNumber}` },
        { label: '空间', value: data.spaceCode, mono: true },
        { label: '创建人', value: data.creator },
        { label: '创建时间', value: formatDateTime(data.createTime) },
      ]
    : [];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <PageBackHeader title="数据集详情" backTo="/dataset" />

      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState message="数据集加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DetailHeaderCard
            title={data.datasetName}
            actions={
              <Btn
                kind="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate(`/dataset/${datasetId}/version/new`)}
              >
                新建版本
              </Btn>
            }
            meta={meta}
          />
          <DataTable
            columns={columns}
            data={data.versions}
            rowKey="versionId"
            empty={<EmptyState description="暂无版本" />}
          />
        </div>
      )}

      <VersionSampleDrawer version={previewVersion} onClose={() => setPreviewVersion(null)} />
    </div>
  );
}

const codeBox: CSSProperties = {
  margin: 0,
  padding: '10px 12px',
  background: palette.fill,
  border: `1px solid ${palette.hairline}`,
  borderRadius: 6,
  fontFamily: fonts.mono,
  fontSize: 12.5,
  lineHeight: 1.6,
  color: palette.text,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

function VersionSampleDrawer({ version, onClose }: { version: DatasetVersion | null; onClose: () => void }) {
  const open = version != null;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dataset', 'versionSample', version?.versionId],
    queryFn: () => getVersionSamplePreview(version!.versionId),
    enabled: open && version != null,
  });
  const ext = version?.parseExt;
  const samples = data?.list ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={600}
      title={version ? `v${version.versionNumber} · 样本预览` : '样本预览'}
      subtitle="仅展示前 10 条"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {ext && (
          <div>
            <div style={{ fontFamily: fonts.display, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>解析统计</div>
            <div style={{ fontSize: 13, color: palette.sub, lineHeight: 1.9 }}>
              总行数 {ext.totalRowCount} · 成功 {ext.successRowCount} · 跳过 {ext.skippedRowCount}
            </div>
            {ext.parseFailureReason && (
              <div style={{ marginTop: 8, fontSize: 13, color: STATUS.failed.fg }}>失败原因：{ext.parseFailureReason}</div>
            )}
            {ext.sampleErrors?.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, color: palette.sub, lineHeight: 1.8 }}>
                {ext.sampleErrors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    第 {e.rowNumber} 行：{e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <div style={{ fontFamily: fonts.display, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>样本内容</div>
          {isLoading ? (
            <LoadingState />
          ) : isError ? (
            <ErrorState message="样本加载失败" onRetry={() => refetch()} />
          ) : samples.length === 0 ? (
            <EmptyState description="暂无样本（可能仍在解析或解析失败）" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {samples.map((s) => (
                <div key={s.id}>
                  <div style={{ fontSize: 11.5, color: palette.weak, marginBottom: 4, fontFamily: fonts.mono }}>
                    #{s.id}
                    {s.bizId ? ` · ${s.bizId}` : ''}
                  </div>
                  <pre style={codeBox}>{JSON.stringify(s.sampleData, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
