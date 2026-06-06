// 内置标注工具 Puck 搭建 —— 类型。编辑端 / 渲染端共用。
import type { Data } from '@measured/puck';

/** 标注界面 schema = Puck 的 Data 结构，存进 labelToolPageSchema。 */
export type PageSchema = Data;

/** 标注结果：扁平 { [resultKey]: value }，saveTaskResult 透传存储。 */
export type AnnotationResult = Record<string, unknown>;

/** 渲染模式：编辑预览 / 标注作业 / 质检只读。 */
export type AnnotationMode = 'edit' | 'label' | 'review';
