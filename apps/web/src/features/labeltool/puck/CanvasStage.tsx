// B 型「画板漂浮」画布：灰底点阵背景 + 居中固定宽白色画板，支持缩放（Ctrl/⌘+滚轮、按钮）与平移（中键拖拽）。
// 缩放用 transform: scale + 外层「测量盒」撑出滚动区（避免 transform 不产生滚动条）；
// 画板内容（含 Puck 选中蓝框）整体一起缩放，保证对齐。
// 行为：点击画板**外**（灰底空白处）→ 清空 Puck 选中（让属性面板回到 Root），符合操作习惯。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePuck } from '@measured/puck';
import { palette } from '@/app/theme';

/** 画板宽度（模拟标注时的容器宽度）。 */
export const ARTBOARD_WIDTH = 880;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

export function CanvasStage({
  zoom,
  onZoomChange,
  children,
}: {
  zoom: number;
  onZoomChange: (z: number) => void;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentH, setContentH] = useState(600);
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const [panning, setPanning] = useState(false);

  // 点击画板外（灰底）→ 清空 Puck 选中。
  // click 在 mouseup 时触发，所以拖拽期间不会误触；缩放（ctrl+wheel）也不触发。
  const { dispatch } = usePuck();
  const onStageClick = (e: React.MouseEvent) => {
    if (innerRef.current && !innerRef.current.contains(e.target as Node)) {
      dispatch({ type: 'setUi', ui: { itemSelector: null } });
    }
  };

  // 测量画板未缩放时的高度，用于撑出缩放后的滚动盒。
  useEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setContentH(el.offsetHeight));
    ro.observe(el);
    setContentH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Ctrl/⌘ + 滚轮缩放。
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onZoomChange(clampZoom(zoom - e.deltaY * 0.0016));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [zoom, onZoomChange]);

  // 中键拖拽平移。
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 1) return; // 仅中键
    const node = scrollRef.current;
    if (!node) return;
    e.preventDefault();
    pan.current = { x: e.clientX, y: e.clientY, sl: node.scrollLeft, st: node.scrollTop };
    setPanning(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pan.current;
    const node = scrollRef.current;
    if (!p || !node) return;
    node.scrollLeft = p.sl - (e.clientX - p.x);
    node.scrollTop = p.st - (e.clientY - p.y);
  };
  const endPan = () => {
    pan.current = null;
    setPanning(false);
  };

  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative', background: palette.canvas }}>
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerLeave={endPan}
        onClick={onStageClick}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'auto',
          cursor: panning ? 'grabbing' : 'default',
          // 点阵网格背景（draw.io 风）
          backgroundImage: `radial-gradient(${palette.border} 1px, transparent 1px)`,
          backgroundSize: '22px 22px',
        }}
      >
        <div style={{ minWidth: '100%', display: 'flex', justifyContent: 'center', padding: '48px 48px 120px' }}>
          {/* 测量盒：尺寸 = 画板尺寸 × zoom，用来撑出滚动区 */}
          <div style={{ width: ARTBOARD_WIDTH * zoom, height: contentH * zoom, flex: 'none', position: 'relative' }}>
            <div
              ref={innerRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: ARTBOARD_WIDTH,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            >
              <div
                style={{
                  background: palette.surface,
                  border: `1px solid ${palette.hairline}`,
                  borderRadius: 12,
                  boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)',
                  padding: 24,
                  minHeight: 420,
                }}
              >
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
