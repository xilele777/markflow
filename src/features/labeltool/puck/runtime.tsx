// 内置标注工具运行时上下文 —— 字段绑定的核心。
// 展示组件从 sampleData 读、输入组件往 result 写；编辑端/标注端/质检端各提供不同的 runtime value。
import { createContext, useContext, type ReactNode } from 'react';
import type { AnnotationMode, AnnotationResult } from './types';

export interface AnnotationRuntime {
  mode: AnnotationMode;
  /** 只读输入样本（来自 getSampleData）。 */
  sampleData: Record<string, unknown>;
  /** 当前标注结果（可变）。 */
  result: AnnotationResult;
  /** 输入组件写结果。 */
  setField: (key: string, value: unknown) => void;
  /** 保存标注结果（固定调后端 saveTaskResult；保存按钮组件专用）。编辑态可不提供。 */
  saveResult?: () => void | Promise<void>;
  /** 是否正在保存（保存按钮 loading）。 */
  saving?: boolean;
}

const FALLBACK: AnnotationRuntime = {
  mode: 'edit',
  sampleData: {},
  result: {},
  setField: () => {},
};

const RuntimeContext = createContext<AnnotationRuntime>(FALLBACK);

export function AnnotationRuntimeProvider({
  value,
  children,
}: {
  value: AnnotationRuntime;
  children: ReactNode;
}) {
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

/** 组件 render 内调用，拿到样本 / 结果 / 写入函数。无 Provider 时回退到空 edit 态，不崩。 */
export function useRuntime(): AnnotationRuntime {
  return useContext(RuntimeContext);
}

/** 按路径读样本字段（支持点路径，如 a.b.c）。 */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
    obj,
  );
}
