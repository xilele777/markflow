// 创建标注工具（内置 Puck，全屏）。顶栏填工具名/编码 + 创建；主体是可视化编辑器。
// 提交：labelToolJsonSchema=数据源示例样本，labelToolPageSchema=Puck Data → createLabelTool。
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Input } from 'antd';
import type { Data } from '@measured/puck';
import { palette, fonts } from '@/app/theme';
import { LabelToolEditor } from '../puck/PuckDemo';
import { buildJsonSchema, parseDataSource } from '../puck/datasource';
import { createLabelTool } from '../api';

// 空白起手：保留默认两栏布局（避免 root.props 缺字段时配置面板出错），但所有 zones 清空。
// 数据源也清空，用户必须先在「数据源」tab 粘贴样本 JSON。
// 注：沙盒 PuckDemo 自带「商品质检」示例模板，那是演示用的；正式创建页不带任何模板。
const EMPTY_DATA = {
  root: { props: { layout: 'two', leftWidth: '60%' } },
  content: [],
  zones: {},
} as unknown as Data;

const backBtn: CSSProperties = {
  height: 30,
  padding: '0 12px',
  borderRadius: 6,
  border: `1px solid ${palette.border}`,
  background: palette.surface,
  color: palette.sub,
  fontFamily: fonts.body,
  fontSize: 13,
  cursor: 'pointer',
};
const titleStyle: CSSProperties = {
  fontFamily: fonts.display,
  fontWeight: 600,
  fontSize: 14,
  color: palette.text,
  whiteSpace: 'nowrap',
};

export default function LabelToolCreatePage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<Data>(EMPTY_DATA);
  const [dsText, setDsText] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onCreate = async () => {
    if (!name.trim()) {
      message.warning('请填写工具名');
      return;
    }
    if (!code.trim()) {
      message.warning('请填写工具编码');
      return;
    }
    const ds = parseDataSource(dsText);
    if (ds.error) {
      message.error(`数据源不合法：${ds.error}`);
      return;
    }
    if (Object.keys(ds.sampleData).length === 0) {
      message.warning('请先在「数据源」填写示例样本');
      return;
    }
    setSubmitting(true);
    try {
      const res = await createLabelTool({
        labelToolCode: code.trim(),
        labelToolName: name.trim(),
        labelToolType: 1,
        // 后端要求 Draft-07 JSON Schema（顶层 type/properties/required），不是原始样本。
        labelToolJsonSchema: buildJsonSchema(ds.sampleData),
        labelToolPageSchema: data as unknown as Record<string, unknown>,
      });
      message.success(`创建成功（id=${res.labelToolId}）`);
      navigate('/labeltool');
    } catch (e) {
      message.error((e as Error)?.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ height: '100vh', zoom: 'calc(1 / var(--app-zoom))', background: palette.canvas }}>
      <LabelToolEditor
        data={data}
        onDataChange={setData}
        dsText={dsText}
        onDsTextChange={setDsText}
        header={
          <>
            <button onClick={() => navigate('/labeltool')} style={backBtn}>
              返回
            </button>
            <span style={titleStyle}>创建标注工具</span>
            <Input
              size="small"
              style={{ width: 200 }}
              placeholder="工具名"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              size="small"
              style={{ width: 190 }}
              placeholder="工具编码（唯一）"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </>
        }
        headerRight={
          <Button type="primary" loading={submitting} onClick={onCreate}>
            创建
          </Button>
        }
      />
    </div>
  );
}
