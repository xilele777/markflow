// DetailHeaderCard —— 详情页头卡（《组件清单.md》三、《页面模板.md》二）。
// 标题 + 状态/标签 + 右侧操作按钮 + hairline + MetaGrid。
import type { ReactNode } from 'react';
import { Card } from 'antd';
import { palette, fonts, sizing } from '@/app/theme';
import { MetaGrid, type MetaField } from './MetaGrid';

interface DetailHeaderCardProps {
  title: ReactNode;
  /** 标题右侧的状态点 / 分类标签等。 */
  tags?: ReactNode;
  /** 右侧操作按钮区。 */
  actions?: ReactNode;
  /** 基本信息字段。 */
  meta?: MetaField[];
  metaColumns?: number;
}

export function DetailHeaderCard({
  title,
  tags,
  actions,
  meta,
  metaColumns = 4,
}: DetailHeaderCardProps) {
  return (
    <Card style={{ borderRadius: sizing.radius + 1 }} styles={{ body: { padding: 22 } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 600, color: palette.text }}>
          {title}
        </span>
        {tags}
        {actions && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{actions}</div>}
      </div>
      {meta && meta.length > 0 && (
        <>
          <div style={{ height: 1, background: palette.hairline, margin: '18px 0' }} />
          <MetaGrid items={meta} columns={metaColumns} />
        </>
      )}
    </Card>
  );
}
