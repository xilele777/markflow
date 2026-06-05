// PageBackHeader —— 详情/表单页顶部「← 返回」+ 标题（《组件清单.md》一、《页面模板.md》二/三）。
// 返回用功能图标（箭头）；标题用 display 字体。右侧可选操作区。
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { palette, fonts } from '@/app/theme';

interface PageBackHeaderProps {
  title: ReactNode;
  /** 返回去向；不传则 history.back()。 */
  backTo?: string;
  /** 右侧操作区。 */
  extra?: ReactNode;
}

export function PageBackHeader({ title, backTo, extra }: PageBackHeaderProps) {
  const navigate = useNavigate();
  const goBack = () => (backTo ? navigate(backTo) : navigate(-1));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <button
        type="button"
        onClick={goBack}
        aria-label="返回"
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          border: `1px solid ${palette.border}`,
          background: palette.surface,
          color: palette.sub,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
        }}
      >
        <ArrowLeftOutlined style={{ fontSize: 14 }} />
      </button>
      <span style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 600, color: palette.text }}>
        {title}
      </span>
      {extra && <div style={{ marginLeft: 'auto' }}>{extra}</div>}
    </div>
  );
}
