// 创建标注工具前的「类型选择」弹窗：内置（Puck 可视化搭建）/ 外部（IFRAME 接入）。
// 点击卡片直接进入对应流程，不需要再点确定。
import { Modal as AntModal } from 'antd';
import { AppstoreOutlined, LinkOutlined } from '@ant-design/icons';
import { palette, fonts } from '@/app/theme';

export type LabelToolKind = 'builtin' | 'iframe';

interface Props {
  open: boolean;
  onCancel: () => void;
  onPick: (kind: LabelToolKind) => void;
}

interface CardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}

function Card({ icon, title, desc, onClick }: CardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: 'left',
        padding: '18px 18px 16px',
        borderRadius: 10,
        border: `1px solid ${palette.border}`,
        background: palette.surface,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color .15s, box-shadow .15s, transform .05s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = palette.accent;
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(47,109,240,.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = palette.border;
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'rgba(47,109,240,.10)',
          color: palette.accent,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
        }}
      >
        {icon}
      </div>
      <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 14, color: palette.text }}>
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: palette.sub, lineHeight: 1.6 }}>{desc}</div>
    </button>
  );
}

export function LabelToolTypeChooserModal({ open, onCancel, onPick }: Props) {
  return (
    <AntModal
      open={open}
      onCancel={onCancel}
      title="选择标注工具类型"
      footer={null}
      width={560}
      destroyOnHidden
      maskClosable
    >
      <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
        <Card
          icon={<AppstoreOutlined />}
          title="内置工具（Puck 搭建）"
          desc="使用可视化编辑器拖拽组件搭建标注界面，结果直接在平台内提交。"
          onClick={() => onPick('builtin')}
        />
        <Card
          icon={<LinkOutlined />}
          title="外部工具（IFRAME 接入）"
          desc="接入已有的第三方标注页面，平台只负责打开和分发任务参数。"
          onClick={() => onPick('iframe')}
        />
      </div>
    </AntModal>
  );
}
