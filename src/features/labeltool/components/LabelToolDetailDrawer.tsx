// 标注工具详情抽屉（《页面模板.md》：实体详情用 Drawer）。基本信息 + 工具地址(IFRAME) + 源数据 Schema + 标注界面回显。
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { App } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { Btn, Drawer, ErrorState, LoadingState, MetaGrid, Tag } from '@/shared/components';
import { LABEL_TOOL_TYPE, metaOf } from '@/shared/constants';
import { formatDateTime } from '@/shared/utils/format';
import { palette, fonts } from '@/app/theme';
import type { MetaField } from '@/shared/components';
import { getLabelToolDetail } from '../api';
import { LabelToolRenderer } from '../puck/LabelToolRenderer';
import {
  derivePreLabelPrompt,
  derivePreReviewPrompt,
  deriveOutputFields,
  parseInputFields,
  type SchemaField,
} from '../schemaInspect';

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

          <FieldsBlock
            title="输入数据格式"
            subtitle="平台从源数据集 / IFRAME getSampleData 拿到的样本应符合此结构。"
            fields={parseInputFields(data.labelToolJsonSchema)}
          />

          {/* 输出字段仅内置 Puck 工具能推导；IFRAME 由业务方自定义 result 结构、平台无法反推。 */}
          {isBuiltin && (
            <FieldsBlock
              title="输出数据格式"
              subtitle="从 pageSchema 推导 · saveTaskResult 提交的 result 结构。"
              fields={deriveOutputFields(data.labelToolPageSchema)}
            />
          )}

          {isBuiltin && (
            <PromptTemplatesBlock
              labelToolName={data.labelToolName}
              jsonSchema={data.labelToolJsonSchema}
              pageSchema={data.labelToolPageSchema}
            />
          )}
        </div>
      )}
    </Drawer>
  );
}

/** AI 提示词模板（预标注 / 预审核），可一键复制。占位 **{{...}}** 让接入方补业务语义。 */
function PromptTemplatesBlock({
  labelToolName,
  jsonSchema,
  pageSchema,
}: {
  labelToolName: string;
  jsonSchema: Record<string, unknown> | null;
  pageSchema: Record<string, unknown> | null;
}) {
  const [tab, setTab] = useState<'preLabel' | 'preReview'>('preLabel');
  const { message } = App.useApp();

  // 只在 tab 切换 / 工具变化时重算，避免长 prompt 字符串每次 render 重生成。
  const { preLabel, preReview } = useMemo(() => {
    const inputs = parseInputFields(jsonSchema);
    const outputs = deriveOutputFields(pageSchema);
    return {
      preLabel: derivePreLabelPrompt(labelToolName, inputs, outputs),
      preReview: derivePreReviewPrompt(labelToolName, inputs, outputs),
    };
  }, [labelToolName, jsonSchema, pageSchema]);

  const content = tab === 'preLabel' ? preLabel : preReview;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      message.success('已复制提示词模板');
    } catch {
      message.error('复制失败，请手动选择文本复制');
    }
  };

  return (
    <div>
      <div style={{ fontFamily: fonts.display, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        AI 提示词模板
      </div>
      <div style={{ fontFamily: fonts.body, fontSize: 12, color: palette.weak, marginBottom: 10 }}>
        由「输入 / 输出格式」自动拼装，复制后把 <code style={{ fontFamily: fonts.mono }}>**{'{{...}}'}**</code>{' '}
        占位换成你的业务语义即可。
      </div>

      {/* tab 切换 + 复制 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <PromptTab active={tab === 'preLabel'} onClick={() => setTab('preLabel')}>
          预标注（aiPreLabel）
        </PromptTab>
        <PromptTab active={tab === 'preReview'} onClick={() => setTab('preReview')}>
          预审核（aiPreReview）
        </PromptTab>
        <div style={{ flex: 1 }} />
        <Btn icon={<CopyOutlined />} onClick={copy}>
          复制
        </Btn>
      </div>

      <pre
        style={{
          margin: 0,
          padding: '14px 16px',
          background: palette.fill,
          border: `1px solid ${palette.hairline}`,
          borderRadius: 6,
          fontFamily: fonts.mono,
          fontSize: 12.5,
          lineHeight: 1.7,
          color: palette.text,
          maxHeight: 420,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </pre>
    </div>
  );
}

function PromptTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 30,
        padding: '0 14px',
        borderRadius: 6,
        border: `1px solid ${active ? palette.accent : palette.border}`,
        background: active ? palette.accent : palette.surface,
        color: active ? '#fff' : palette.sub,
        fontFamily: fonts.body,
        fontSize: 12.5,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background .15s, color .15s, border-color .15s',
      }}
    >
      {children}
    </button>
  );
}

/** 字段清单块：标题 + 副标题 + 表格（字段名 / 类型 / 取值 / 必填 / 备注）。 */
function FieldsBlock({
  title,
  subtitle,
  fields,
}: {
  title: string;
  subtitle?: string;
  fields: SchemaField[];
}) {
  return (
    <div>
      <div
        style={{ fontFamily: fonts.display, fontSize: 14, fontWeight: 600, marginBottom: 4 }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{ fontFamily: fonts.body, fontSize: 12, color: palette.weak, marginBottom: 10 }}
        >
          {subtitle}
        </div>
      )}
      {fields.length === 0 ? (
        <div
          style={{
            padding: '14px 14px',
            background: palette.fill,
            border: `1px solid ${palette.hairline}`,
            borderRadius: 6,
            color: palette.weak,
            fontSize: 12.5,
          }}
        >
          暂无字段
        </div>
      ) : (
        <div
          style={{
            border: `1px solid ${palette.hairline}`,
            borderRadius: 6,
            overflow: 'hidden',
            background: palette.surface,
          }}
        >
          <div style={fieldsHeadRow}>
            <span style={{ ...fieldsCell, width: '32%' }}>字段</span>
            <span style={{ ...fieldsCell, width: '22%' }}>类型</span>
            <span style={{ ...fieldsCell, flex: 1 }}>取值 / 备注</span>
            <span style={{ ...fieldsCell, width: 56, textAlign: 'right' }}>必填</span>
          </div>
          {fields.map((f, i) => (
            <div
              key={f.name}
              style={{
                ...fieldsRow,
                borderTop: i === 0 ? 'none' : `1px solid ${palette.hairline}`,
              }}
            >
              <span style={{ ...fieldsCell, width: '32%', fontFamily: fonts.mono, color: palette.text }}>
                {f.name}
              </span>
              <span style={{ ...fieldsCell, width: '22%', fontFamily: fonts.mono, color: palette.sub }}>
                {f.type}
              </span>
              <span style={{ ...fieldsCell, flex: 1, color: palette.sub, fontFamily: fonts.body }}>
                {f.enum && f.enum.length > 0
                  ? f.enum.join(' / ')
                  : f.note || <span style={{ color: palette.weak }}>—</span>}
              </span>
              <span
                style={{
                  ...fieldsCell,
                  width: 56,
                  textAlign: 'right',
                  color: f.required ? palette.accent : palette.weak,
                }}
              >
                {f.required ? '✓' : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const fieldsHeadRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  background: palette.fill,
  borderBottom: `1px solid ${palette.hairline}`,
  fontFamily: fonts.body,
  fontSize: 11.5,
  color: palette.weak,
  letterSpacing: '0.02em',
};
const fieldsRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 12px',
  fontSize: 12.5,
};
const fieldsCell: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  paddingRight: 10,
};
