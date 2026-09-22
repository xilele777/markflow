// 回显渲染器（part 3 核心）：吃 labelToolPageSchema + 一条样本(labelToolJsonSchema/真实样本) → <Render> 出标注界面。
// 标注页(label) / 质检页(review) / 详情预览 共用。与编辑器解耦，只依赖同一套 puckConfig。
import { Render, type Data } from '@measured/puck';
import { palette, fonts } from '@/app/theme';
import { puckConfig } from './config';
import { AnnotationRuntimeProvider } from './runtime';
import type { AnnotationMode, AnnotationResult } from './types';

export interface LabelToolRendererProps {
  /** Puck Data（来自 labelToolPageSchema）。空则提示。 */
  pageSchema: Record<string, unknown> | null | undefined;
  /** 只读样本（来自 getSampleData 真实样本；详情预览时用 labelToolJsonSchema 存的示例样本）。 */
  sampleData?: Record<string, unknown> | null;
  /** label=标注可写、review=质检只读、edit=编辑预览。默认 review。 */
  mode?: AnnotationMode;
  result?: AnnotationResult;
  setField?: (key: string, value: unknown) => void;
  saveResult?: () => void | Promise<void>;
  saving?: boolean;
}

export function LabelToolRenderer({
  pageSchema,
  sampleData,
  mode = 'review',
  result = {},
  setField,
  saveResult,
  saving,
}: LabelToolRendererProps) {
  if (!pageSchema || typeof pageSchema !== 'object') {
    return (
      <div style={{ fontSize: 13, color: palette.weak, fontFamily: fonts.body, padding: 16 }}>
        该工具未配置标注界面（labelToolPageSchema 为空）。
      </div>
    );
  }
  return (
    <AnnotationRuntimeProvider
      value={{ mode, sampleData: sampleData ?? {}, result, setField: setField ?? (() => {}), saveResult, saving }}
    >
      <Render config={puckConfig} data={pageSchema as unknown as Data} />
    </AnnotationRuntimeProvider>
  );
}
