// 标注界面搭建 · 沙盒（临时，P3 演进为 /labeltool/new 真实编辑端后删除）。
// 自定义三栏布局（Puck 组合式 API）：左 = 数据源 / 页面搭建 两个 tab；中 = 画布；右 = 字段配置。
// 本路由用 zoom 抵消全局 0.9，让 Puck 在 net 100% 下渲染（避免选中蓝框错位）。
import '@measured/puck/puck.css';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Puck, Render, type Data } from '@measured/puck';
import { Input, App, Drawer as AntDrawer } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { palette, fonts } from '@/app/theme';
import { puckConfig } from './config';
import { AnnotationRuntimeProvider } from './runtime';
import { DataSourceFieldsProvider, parseDataSource, type FieldInfo } from './datasource';
import { Palette } from './Palette';
import { LayoutSelector, PropsPanelTitle, fieldLabelOverride } from './editorWidgets';
import { PropsPanel } from './PropsPanel';
import { CanvasStage, clampZoom } from './CanvasStage';
import type { AnnotationResult } from './types';

export const DEFAULT_DATASOURCE = JSON.stringify(
  {
    productTitle: '夏季纯棉短袖 T 恤 圆领宽松百搭男女同款',
    attributes: '颜色=白色  尺码=L  材质=纯棉  风格=简约',
    videoUrl: 'https://mdn.github.io/shared-assets/videos/flower.mp4',
    images: [
      'https://picsum.photos/seed/tee1/640/480',
      'https://picsum.photos/seed/tee2/640/480',
      'https://picsum.photos/seed/tee3/640/480',
    ],
  },
  null,
  2,
);

// 示例：商品质检标注界面（两栏：左=内容区[标题/属性 + 视频/轮播图并排]，右=标注栏[评级/badcase/原因/按钮]）。
// 自定义 root 字段（layout/leftWidth）不在 Puck 默认 root 类型里，整体经 unknown 断言为 Data。
export const INITIAL = {
  root: { props: { layout: 'two', leftWidth: '60%' } },
  content: [],
  zones: {
    'root:col1': [
      { type: 'TextView', props: { id: 'tv-title', label: '商品标题', sampleField: 'productTitle', minHeight: 0 } },
      { type: 'TextView', props: { id: 'tv-attr', label: '属性', sampleField: 'attributes', minHeight: 0 } },
      { type: 'Row', props: { id: 'row-media', columns: 2, gap: 16 } },
    ],
    'row-media:cell-0': [
      { type: 'VideoView', props: { id: 'vv-1', label: '视频', sampleField: 'videoUrl', width: '100%', height: 0, controls: true } },
    ],
    'row-media:cell-1': [
      { type: 'CarouselView', props: { id: 'cv-1', label: '轮播图', sampleField: 'images', height: 0 } },
    ],
    'root:col2': [
      {
        type: 'SegmentInput',
        props: {
          id: 'seg-1',
          label: '质检评级',
          resultKey: 'grade',
          options: [{ label: '优秀' }, { label: '合格' }, { label: '不合格' }],
        },
      },
      {
        type: 'CheckboxInput',
        props: {
          id: 'cb-1',
          label: '勾选 badcase',
          resultKey: 'badcases',
          options: [{ label: 'badcase-1' }, { label: 'badcase-2' }, { label: 'badcase-3' }],
          vertical: true,
        },
      },
      {
        type: 'TextInput',
        props: { id: 'ti-1', label: '不合格原因', resultKey: 'reason', placeholder: '请输入不合格原因', multiline: true, minHeight: 0 },
      },
      { type: 'SaveResultButton', props: { id: 'sb-1', text: '保存标注结果', align: 'right', block: false } },
    ],
  },
} as unknown as Data;

const sidebarHeader: CSSProperties = {
  height: 38,
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  padding: '0 14px',
  fontFamily: fonts.display,
  fontSize: 12.5,
  fontWeight: 600,
  color: palette.sub,
  borderBottom: `1px solid ${palette.hairline}`,
};
const headerBtn: CSSProperties = {
  height: 32,
  padding: '0 14px',
  borderRadius: 6,
  border: `1px solid ${palette.border}`,
  background: palette.surface,
  color: palette.sub,
  fontFamily: fonts.body,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        height: 40,
        border: 'none',
        borderBottom: `2px solid ${active ? palette.accent : 'transparent'}`,
        background: 'transparent',
        color: active ? palette.text : palette.sub,
        fontFamily: fonts.body,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function DataSourcePanel({
  text,
  onChange,
  fields,
  error,
}: {
  text: string;
  onChange: (v: string) => void;
  fields: FieldInfo[];
  error?: string;
}) {
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ fontSize: 12.5, color: palette.sub, lineHeight: 1.6 }}>
        粘贴一条<strong style={{ color: palette.text }}>示例样本</strong>（JSON 对象，可嵌套）。它的字段会成为组件「绑定字段」的下拉项，并作为画布的预览数据。
      </div>
      <Input.TextArea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        autoSize={{ minRows: 8, maxRows: 16 }}
        style={{ fontFamily: fonts.mono, fontSize: 12.5 }}
        spellCheck={false}
      />
      {error ? (
        <div style={{ fontSize: 12.5, color: '#a8423a' }}>{error}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: palette.weak }}>解析出 {fields.length} 个可绑定字段：</div>
          {fields.length === 0 ? (
            <span style={{ fontSize: 12, color: palette.weak }}>暂无字段</span>
          ) : (
            fields.map((f) => (
              <div
                key={f.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '3px 8px',
                  borderRadius: 5,
                  background: palette.fill,
                }}
              >
                <span style={{ fontFamily: fonts.mono, fontSize: 11.5, color: palette.accent }}>{f.path}</span>
                <span style={{ fontSize: 10.5, color: palette.weak }}>{FIELD_TYPE_LABEL[f.type]}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const FIELD_TYPE_LABEL: Record<FieldInfo['type'], string> = {
  string: '文本',
  number: '数字',
  boolean: '布尔',
  array: '数组',
  null: '空',
};

function BuildPanel() {
  const [outlineOpen, setOutlineOpen] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 'none', borderBottom: `1px solid ${palette.hairline}` }}>
        <LayoutSelector />
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
        <Palette />
      </div>
      <button
        type="button"
        onClick={() => setOutlineOpen((o) => !o)}
        style={{
          ...sidebarHeader,
          borderLeft: 'none',
          borderRight: 'none',
          borderTop: `1px solid ${palette.hairline}`,
          background: 'transparent',
          width: '100%',
          cursor: 'pointer',
          gap: 6,
        }}
      >
        {outlineOpen ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
        大纲
      </button>
      {outlineOpen && (
        <div style={{ flex: '0 0 42%', minHeight: 0, padding: '6px 4px', overflow: 'auto' }}>
          <Puck.Outline />
        </div>
      )}
    </div>
  );
}

function PreviewMode({
  data,
  sampleData,
  result,
  setField,
  onBack,
}: {
  data: Data;
  sampleData: Record<string, unknown>;
  result: AnnotationResult;
  setField: (key: string, value: unknown) => void;
  onBack: () => void;
}) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [showResult, setShowResult] = useState(false);

  // 「保存结果」按钮组件会调用它。沙盒里模拟；真实环境此处 = saveTaskResult(sampleType=1, result)。
  const saveResult = () => {
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      message.success('已保存（沙盒模拟，真实环境将调用后端保存接口）');
    }, 400);
  };

  return (
    <div style={{ position: 'relative', height: '100%', background: palette.canvas }}>
      {/* 浮动操作条（全屏预览，钉在右上角） */}
      <div style={{ position: 'absolute', top: 14, right: 18, display: 'flex', gap: 8, zIndex: 10 }}>
        <button onClick={() => setShowResult(true)} style={headerBtn}>
          查看结果
        </button>
        <button onClick={onBack} style={headerBtn}>
          返回编辑
        </button>
      </div>
      <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '28px 28px 60px' }}>
        <AnnotationRuntimeProvider value={{ mode: 'label', sampleData, result, setField, saveResult, saving }}>
          <Render config={puckConfig} data={data} />
        </AnnotationRuntimeProvider>
      </div>
      <AntDrawer
        title="标注结果 JSON（saveTaskResult 的内容）"
        placement="right"
        width={400}
        open={showResult}
        onClose={() => setShowResult(false)}
      >
        <pre
          style={{
            margin: 0,
            fontFamily: fonts.mono,
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: palette.text,
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      </AntDrawer>
    </div>
  );
}

function zoomBtnStyle(): CSSProperties {
  return {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${palette.border}`,
    background: palette.surface,
    color: palette.sub,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 15,
    lineHeight: 1,
    fontFamily: fonts.body,
  };
}

function ZoomControls({ zoom, onZoomChange }: { zoom: number; onZoomChange: (z: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button style={zoomBtnStyle()} title="缩小（⌘/Ctrl + 滚轮）" onClick={() => onZoomChange(clampZoom(zoom - 0.1))}>
        −
      </button>
      <button
        style={{
          ...zoomBtnStyle(),
          width: 'auto',
          padding: '0 10px',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 12.5,
        }}
        title="恢复 100%"
        onClick={() => onZoomChange(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button style={zoomBtnStyle()} title="放大（⌘/Ctrl + 滚轮）" onClick={() => onZoomChange(clampZoom(zoom + 0.1))}>
        +
      </button>
      <button
        style={{ ...zoomBtnStyle(), width: 'auto', padding: '0 10px', fontSize: 12.5 }}
        title="适应屏幕"
        onClick={() => onZoomChange(1)}
      >
        适应
      </button>
    </div>
  );
}

export interface LabelToolEditorProps {
  /** 受控：Puck 页面数据（= labelToolPageSchema）。 */
  data: Data;
  onDataChange: (d: Data) => void;
  /** 受控：数据源示例样本文本（解析后 = labelToolJsonSchema）。 */
  dsText: string;
  onDsTextChange: (t: string) => void;
  /** 顶栏左侧自定义内容（沙盒放标题；创建页放返回+工具名/编码）。 */
  header?: ReactNode;
  /** 顶栏右侧、缩放控件之前的自定义内容（创建页放「创建」按钮）。 */
  headerRight?: ReactNode;
}

/** 标注界面编辑器（沙盒与创建页共用）。父级负责 100vh + zoom 抵消外壳。 */
export function LabelToolEditor({ data, onDataChange, dsText, onDsTextChange, header, headerRight }: LabelToolEditorProps) {
  const [result, setResult] = useState<AnnotationResult>({});
  const [previewing, setPreviewing] = useState(false);
  const [leftTab, setLeftTab] = useState<'datasource' | 'build'>('build');
  const [zoom, setZoom] = useState(1);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const setField = (key: string, value: unknown) =>
    setResult((prev) => ({ ...prev, [key]: value }));

  const ds = useMemo(() => parseDataSource(dsText), [dsText]);

  return (
    <div style={{ height: '100%', background: palette.canvas }}>
      {previewing ? (
        <PreviewMode
          data={data}
          sampleData={ds.sampleData}
          result={result}
          setField={setField}
          onBack={() => setPreviewing(false)}
        />
      ) : (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* 顶栏 */}
          <div
            style={{
              height: 52,
              flex: 'none',
              borderBottom: `1px solid ${palette.hairline}`,
              background: palette.surface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>{header}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {headerRight}
              <ZoomControls zoom={zoom} onZoomChange={setZoom} />
              <button onClick={() => setPreviewing(true)} style={headerBtn}>
                预览
              </button>
            </div>
          </div>

          <DataSourceFieldsProvider value={ds.fields}>
            <AnnotationRuntimeProvider value={{ mode: 'edit', sampleData: ds.sampleData, result, setField }}>
              <Puck
                config={puckConfig}
                data={data}
                onChange={onDataChange}
                iframe={{ enabled: false }}
                overrides={{ fieldLabel: fieldLabelOverride }}
              >
                <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                  {/* 左：数据源 / 页面搭建 */}
                  <div
                    style={{
                      width: 288,
                      flex: 'none',
                      borderRight: `1px solid ${palette.border}`,
                      background: palette.surface,
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                    }}
                  >
                    <div style={{ display: 'flex', flex: 'none', borderBottom: `1px solid ${palette.hairline}` }}>
                      <Tab active={leftTab === 'datasource'} onClick={() => setLeftTab('datasource')}>
                        数据源
                      </Tab>
                      <Tab active={leftTab === 'build'} onClick={() => setLeftTab('build')}>
                        页面搭建
                      </Tab>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      {leftTab === 'datasource' ? (
                        <DataSourcePanel text={dsText} onChange={onDsTextChange} fields={ds.fields} error={ds.error} />
                      ) : (
                        <BuildPanel />
                      )}
                    </div>
                  </div>

                  {/* 中：画布（B 型画板漂浮） */}
                  <CanvasStage zoom={zoom} onZoomChange={setZoom}>
                    <Puck.Preview />
                  </CanvasStage>

                  {/* 右：字段配置（可收起） */}
                  {rightCollapsed ? (
                    <div
                      style={{
                        width: 36,
                        flex: 'none',
                        borderLeft: `1px solid ${palette.border}`,
                        background: palette.surface,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        paddingTop: 10,
                      }}
                    >
                      <button
                        style={{ ...zoomBtnStyle(), width: 26, height: 26 }}
                        title="展开属性栏"
                        onClick={() => setRightCollapsed(false)}
                      >
                        ‹
                      </button>
                      <div
                        style={{
                          writingMode: 'vertical-rl',
                          marginTop: 12,
                          fontSize: 12,
                          color: palette.weak,
                          fontFamily: fonts.body,
                          letterSpacing: 2,
                        }}
                      >
                        属性
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        width: 300,
                        flex: 'none',
                        borderLeft: `1px solid ${palette.border}`,
                        background: palette.surface,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                      }}
                    >
                      <div
                        style={{
                          flex: 'none',
                          padding: '9px 14px',
                          borderBottom: `1px solid ${palette.hairline}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <PropsPanelTitle />
                        <button
                          style={{ ...zoomBtnStyle(), width: 26, height: 26, flex: 'none' }}
                          title="收起属性栏"
                          onClick={() => setRightCollapsed(true)}
                        >
                          ›
                        </button>
                      </div>
                      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                        <PropsPanel />
                      </div>
                    </div>
                  )}
                </div>
              </Puck>
            </AnnotationRuntimeProvider>
          </DataSourceFieldsProvider>
        </div>
      )}
    </div>
  );
}

/** 临时沙盒路由 /labeltool/_demo：自带 state，验收编辑器用。正式创建走 /labeltool/new。 */
export default function PuckDemo() {
  const [data, setData] = useState<Data>(INITIAL);
  const [dsText, setDsText] = useState(DEFAULT_DATASOURCE);
  return (
    <div style={{ height: '100vh', zoom: 'calc(1 / var(--app-zoom))', background: palette.canvas }}>
      <LabelToolEditor
        data={data}
        onDataChange={setData}
        dsText={dsText}
        onDsTextChange={setDsText}
        header={
          <span style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 14, color: palette.text }}>
            标注界面搭建（沙盒）
          </span>
        }
      />
    </div>
  );
}
