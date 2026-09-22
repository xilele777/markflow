// 媒体类 · 图片：绑定 sampleData 里的图片 URL 字段（可嵌套，如 media.imageUrl），只读展示。
import type { ComponentConfig } from '@measured/puck';
import { palette, fonts } from '@/app/theme';
import { useRuntime, getByPath } from '../runtime';
import { sampleFieldField, widthField, heightField } from '../fields';

export interface ImageViewProps {
  label: string;
  /** 绑定的图片 URL 字段。 */
  sampleField: string;
  width?: string;
  height?: number;
  fit?: 'contain' | 'cover';
  radius?: number;
}

export const ImageView: ComponentConfig<ImageViewProps> = {
  label: '图片',
  fields: {
    label: { type: 'text', label: '标题' },
    sampleField: sampleFieldField,
    width: widthField,
    height: heightField,
    fit: {
      type: 'radio',
      label: '填充方式',
      options: [
        { label: '完整', value: 'contain' },
        { label: '铺满', value: 'cover' },
      ],
    },
    radius: { type: 'number', label: '圆角 (px)', min: 0 },
  },
  defaultProps: { label: '图片', sampleField: '', width: '100%', height: 0, fit: 'contain', radius: 6 },
  // render 只做转发：hooks 放在真正的函数组件 ImageViewRender 里（rules-of-hooks）。
  render: (props) => <ImageViewRender {...props} />,
};

function ImageViewRender({ label, sampleField, width, height, fit, radius }: ImageViewProps) {
  const { sampleData } = useRuntime();
  const url = sampleField ? getByPath(sampleData, sampleField) : undefined;
  const src = typeof url === 'string' ? url : '';
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 12, color: palette.weak, marginBottom: 4 }}>{label}</div>}
      {src ? (
        <img
          src={src}
          alt={label}
          style={{
            display: 'block',
            width: width || '100%',
            height: height || 'auto',
            maxWidth: '100%',
            objectFit: fit || 'contain',
            borderRadius: radius ?? 6,
            border: `1px solid ${palette.hairline}`,
            background: palette.fill,
          }}
        />
      ) : (
        <div
          style={{
            width: width || '100%',
            height: height || 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            border: `1px dashed ${palette.border}`,
            color: palette.weak,
            fontSize: 12.5,
            fontFamily: fonts.body,
          }}
        >
          {`（未绑定图片字段：${sampleField || '—'}）`}
        </div>
      )}
    </div>
  );
}
