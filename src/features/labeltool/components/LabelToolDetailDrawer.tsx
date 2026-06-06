// 标注工具详情抽屉（《页面模板.md》：实体详情用 Drawer）。基本信息 + 工具地址(IFRAME) + 源数据 Schema + 标注界面回显。
import { useQuery } from '@tanstack/react-query';
import { Drawer, ErrorState, LoadingState, MetaGrid, Tag } from '@/shared/components';
import { LABEL_TOOL_TYPE, metaOf } from '@/shared/constants';
import { formatDateTime } from '@/shared/utils/format';
import { palette, fonts } from '@/app/theme';
import type { MetaField } from '@/shared/components';
import { getLabelToolDetail } from '../api';
import { LabelToolRenderer } from '../puck/LabelToolRenderer';

interface LabelToolDetailDrawerProps {
  labelToolId: number | null;
  open: boolean;
  onClose: () => void;
}

export function LabelToolDetailDrawer({ labelToolId, open, onClose }: LabelToolDetailDrawerProps) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['labeltool', 'detail', labelToolId],
    queryFn: () => getLabelToolDetail(labelToolId!),
    enabled: open && labelToolId != null,
  });

  const typeMeta = data ? metaOf(LABEL_TOOL_TYPE, data.labelToolType) : null;
  const isIframe = data?.labelToolType === 2;
  const isBuiltin = data?.labelToolType === 1;

  const meta: MetaField[] = data
    ? [
        { label: '编码', value: data.labelToolCode, mono: true },
        { label: '类型', value: typeMeta ? <Tag tone={typeMeta.tone}>{typeMeta.label}</Tag> : '—' },
        { label: '创建人', value: data.creator },
        { label: '创建时间', value: formatDateTime(data.createTime) },
        ...(isIframe ? [{ label: '工具地址', value: data.labelToolUrl || '—', mono: true }] : []),
      ]
    : [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={600}
      title={data?.labelToolName ?? '标注工具详情'}
      subtitle={data?.labelToolCode}
    >
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState message="加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <MetaGrid columns={2} items={meta} />

          {isBuiltin && (
            <div>
              <div style={{ fontFamily: fonts.display, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                标注界面预览
              </div>
              <div
                style={{
                  border: `1px solid ${palette.hairline}`,
                  borderRadius: 8,
                  background: palette.surface,
                  padding: 14,
                  maxHeight: 420,
                  overflow: 'auto',
                }}
              >
                <LabelToolRenderer
                  pageSchema={data.labelToolPageSchema}
                  sampleData={data.labelToolJsonSchema}
                  mode="review"
                />
              </div>
            </div>
          )}

          <div>
            <div style={{ fontFamily: fonts.display, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              源数据 Schema
            </div>
            <pre
              style={{
                margin: 0,
                padding: '12px 14px',
                background: palette.fill,
                border: `1px solid ${palette.hairline}`,
                borderRadius: 6,
                fontFamily: fonts.mono,
                fontSize: 12.5,
                lineHeight: 1.6,
                color: palette.text,
                maxHeight: 360,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {data.labelToolJsonSchema
                ? JSON.stringify(data.labelToolJsonSchema, null, 2)
                : '—'}
            </pre>
          </div>
        </div>
      )}
    </Drawer>
  );
}
