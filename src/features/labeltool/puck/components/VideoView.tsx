// 媒体类 · 视频：绑定 sampleData 里的视频 URL 字段（可嵌套，如 media.videoUrl），原生 <video> 播放。
import type { ComponentConfig } from '@measured/puck';
import { palette, fonts } from '@/app/theme';
import { useRuntime, getByPath } from '../runtime';
import { sampleFieldField, widthField, heightField } from '../fields';

export interface VideoViewProps {
  label: string;
  /** 绑定的视频 URL 字段。 */
  sampleField: string;
  width?: string;
  height?: number;
  controls?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
}

export const VideoView: ComponentConfig<VideoViewProps> = {
  label: '视频',
  fields: {
    label: { type: 'text', label: '标题' },
    sampleField: sampleFieldField,
    width: widthField,
    height: heightField,
    controls: {
      type: 'radio',
      label: '播放控件',
      options: [
        { label: '显示', value: true },
        { label: '隐藏', value: false },
      ],
    },
    autoplay: {
      type: 'radio',
      label: '自动播放',
      options: [
        { label: '开', value: true },
        { label: '关', value: false },
      ],
    },
    muted: {
      type: 'radio',
      label: '静音',
      options: [
        { label: '开', value: true },
        { label: '关', value: false },
      ],
    },
    loop: {
      type: 'radio',
      label: '循环',
      options: [
        { label: '开', value: true },
        { label: '关', value: false },
      ],
    },
  },
  defaultProps: { label: '视频', sampleField: '', width: '100%', height: 0, controls: true, autoplay: false, muted: false, loop: false },
  // render 只做转发：hooks 放在真正的函数组件 VideoViewRender 里（rules-of-hooks）。
  render: (props) => <VideoViewRender {...props} />,
};

function VideoViewRender({ label, sampleField, width, height, controls, autoplay, muted, loop }: VideoViewProps) {
  const { sampleData } = useRuntime();
  const url = sampleField ? getByPath(sampleData, sampleField) : undefined;
  const src = typeof url === 'string' ? url : '';
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 12, color: palette.weak, marginBottom: 4 }}>{label}</div>}
      {src ? (
        <video
          src={src}
          controls={controls}
          autoPlay={autoplay}
          muted={muted}
          loop={loop}
          style={{
            display: 'block',
            width: width || '100%',
            height: height || 'auto',
            maxWidth: '100%',
            borderRadius: 6,
            border: `1px solid ${palette.hairline}`,
            background: '#000',
          }}
        />
      ) : (
        <div
          style={{
            width: width || '100%',
            height: height || 160,
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
          {`（未绑定视频字段：${sampleField || '—'}）`}
        </div>
      )}
    </div>
  );
}
