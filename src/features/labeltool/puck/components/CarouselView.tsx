// 媒体类 · 轮播图：绑定 sampleData 里的「图片 URL 数组」字段，◀ ▶ 翻页 + 圆点指示，支持自动轮播。
import { useEffect, useRef, useState } from 'react';
import type { ComponentConfig } from '@measured/puck';
import { palette, fonts } from '@/app/theme';
import { useRuntime, getByPath } from '../runtime';
import { sampleFieldField, heightField } from '../fields';

export interface CarouselViewProps {
  label: string;
  /** 绑定的图片 URL 数组字段（如 images）。 */
  sampleField: string;
  height?: number;
  fit: 'contain' | 'cover';
  autoplay: boolean;
  /** 轮播速度（毫秒/张）。 */
  interval: number;
  showDots: boolean;
  showArrows: boolean;
}

export const CarouselView: ComponentConfig<CarouselViewProps> = {
  label: '轮播图',
  fields: {
    label: { type: 'text', label: '标题' },
    sampleField: sampleFieldField,
    height: heightField,
    fit: {
      type: 'radio',
      label: '填充方式',
      options: [
        { label: '完整', value: 'contain' },
        { label: '铺满', value: 'cover' },
      ],
    },
    autoplay: {
      type: 'radio',
      label: '自动轮播',
      options: [
        { label: '开', value: true },
        { label: '关', value: false },
      ],
    },
    interval: { type: 'number', label: '轮播速度 (ms/张)', min: 500 },
    showDots: {
      type: 'radio',
      label: '圆点',
      options: [
        { label: '显示', value: true },
        { label: '隐藏', value: false },
      ],
    },
    showArrows: {
      type: 'radio',
      label: '左右箭头',
      options: [
        { label: '显示', value: true },
        { label: '隐藏', value: false },
      ],
    },
  },
  defaultProps: {
    label: '轮播图',
    sampleField: '',
    height: 0,
    fit: 'contain',
    autoplay: false,
    interval: 3000,
    showDots: true,
    showArrows: true,
  },
  render: ({ label, sampleField, height, fit, autoplay, interval, showDots, showArrows }) => {
    const { sampleData, mode } = useRuntime();
    const raw = sampleField ? getByPath(sampleData, sampleField) : undefined;
    const list = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
    const [idx, setIdx] = useState(0);
    const len = list.length;
    const cur = len ? ((idx % len) + len) % len : 0;
    const src = list[cur] as string | undefined;
    const h = height || 180;

    // 自动轮播（编辑态不动，避免干扰搭建）。
    const idxRef = useRef(0);
    idxRef.current = idx;
    useEffect(() => {
      if (!autoplay || len <= 1 || mode === 'edit') return;
      const t = setInterval(() => setIdx(idxRef.current + 1), Math.max(500, interval || 3000));
      return () => clearInterval(t);
    }, [autoplay, interval, len, mode]);

    return (
      <div style={{ marginBottom: 14 }}>
        {label && <div style={{ fontSize: 12, color: palette.weak, marginBottom: 4 }}>{label}</div>}
        <div
          style={{
            position: 'relative',
            height: h,
            borderRadius: 6,
            border: `1px solid ${palette.hairline}`,
            background: palette.fill,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {src ? (
            <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: fit || 'contain' }} />
          ) : (
            <span style={{ fontSize: 12.5, color: palette.weak, fontFamily: fonts.body }}>
              {`（未绑定图片数组：${sampleField || '—'}）`}
            </span>
          )}
          {showArrows && len > 1 && (
            <>
              <button onClick={() => setIdx((v) => v - 1)} style={navBtn('left')} aria-label="上一张">
                ‹
              </button>
              <button onClick={() => setIdx((v) => v + 1)} style={navBtn('right')} aria-label="下一张">
                ›
              </button>
            </>
          )}
        </div>
        {showDots && len > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }}>
            {list.map((_, i) => (
              <span
                key={i}
                style={{ width: 7, height: 7, borderRadius: '50%', background: i === cur ? palette.accent : palette.border }}
              />
            ))}
          </div>
        )}
      </div>
    );
  },
};

function navBtn(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(15,23,42,0.5)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
  } as React.CSSProperties;
}
