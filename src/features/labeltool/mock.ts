// 脚手架阶段 labeltool mock（后端就绪后删除，页面改调真实接口）。
import type { PageResult } from '@/types/api';
import type { LabelToolDetail, LabelToolListItem } from './types';

const TOOLS: LabelToolListItem[] = [
  { labelToolId: 1, labelToolCode: 'dialogue-annotator', labelToolName: '对话标注器', labelToolType: 1 },
  { labelToolId: 2, labelToolCode: 'text-annotator', labelToolName: '文本标注器', labelToolType: 1 },
  { labelToolId: 3, labelToolCode: 'mm-annotator', labelToolName: '多模态标注器', labelToolType: 2 },
  { labelToolId: 4, labelToolCode: 'image-annotator', labelToolName: '图像标注器', labelToolType: 2 },
];

const SCHEMAS: Record<number, Record<string, unknown>> = {
  1: {
    type: 'object',
    properties: {
      conversation: { type: 'array', title: '对话轮次', items: { type: 'object' } },
      scene: { type: 'string', title: '场景' },
    },
    required: ['conversation'],
  },
  2: {
    type: 'object',
    properties: {
      content: { type: 'string', title: '文本内容' },
      source: { type: 'string', title: '来源' },
    },
    required: ['content'],
  },
  3: {
    type: 'object',
    properties: {
      imageUrl: { type: 'string', title: '图片地址' },
      caption: { type: 'string', title: '图注' },
    },
    required: ['imageUrl'],
  },
  4: {
    type: 'object',
    properties: { imageUrl: { type: 'string', title: '图片地址' } },
    required: ['imageUrl'],
  },
};

export function mockGetLabelToolList(req: {
  keyword?: string;
  pageNum: number;
  pageSize: number;
}): Promise<PageResult<LabelToolListItem>> {
  const kw = req.keyword?.trim().toLowerCase();
  const filtered = TOOLS.filter(
    (t) =>
      !kw ||
      t.labelToolName.toLowerCase().includes(kw) ||
      t.labelToolCode.toLowerCase().includes(kw),
  );
  const start = (req.pageNum - 1) * req.pageSize;
  return new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          list: filtered.slice(start, start + req.pageSize),
          total: filtered.length,
          pageNum: req.pageNum,
          pageSize: req.pageSize,
        }),
      200,
    ),
  );
}

export function mockGetLabelToolDetail(labelToolId: number): Promise<LabelToolDetail> {
  const t = TOOLS.find((x) => x.labelToolId === labelToolId)!;
  return new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          ...t,
          labelToolUrl:
            t.labelToolType === 2 ? `https://tools.example.com/${t.labelToolCode}` : '',
          labelToolJsonSchema: SCHEMAS[labelToolId] ?? null,
          labelToolPageSchema: null,
          creator: '系统管理员',
          createTime: 1775000000000 + labelToolId * 86400000,
        }),
      300,
    ),
  );
}
