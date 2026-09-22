// 媒体类 · 音频：绑定 sampleData 里的音频 URL 字段，原生 <audio> 播放。
import type { ComponentConfig } from '@measured/puck';
import { palette, fonts } from '@/app/theme';
import { useRuntime, getByPath } from '../runtime';
import { sampleFieldField } from '../fields';

export interface AudioViewProps {
  label: string;
  sampleField: string;
}

export const AudioView: ComponentConfig<AudioViewProps> = {
  label: '音频',
  fields: {
    label: { type: 'text', label: '标题' },
    sampleField: sampleFieldField,
  },
  defaultProps: { label: '音频', sampleField: '' },
  // render 只做转发：hooks 放在真正的函数组件 AudioViewRender 里（rules-of-hooks）。
  render: (props) => <AudioViewRender {...props} />,
};

function AudioViewRender({ label, sampleField }: AudioViewProps) {
  const { sampleData } = useRuntime();
  const url = sampleField ? getByPath(sampleData, sampleField) : undefined;
  const src = typeof url === 'string' ? url : '';
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 12, color: palette.weak, marginBottom: 4 }}>{label}</div>}
      {src ? (
        <audio src={src} controls style={{ width: '100%' }} />
      ) : (
        <div style={{ fontSize: 12.5, color: palette.weak, fontFamily: fonts.body }}>
          {`（未绑定音频字段：${sampleField || '—'}）`}
        </div>
      )}
    </div>
  );
}
