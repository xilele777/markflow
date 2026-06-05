// 脚手架阶段的 mock 数据（后端就绪后删除，列表/创建/上传改调真实接口）。
// 字段形状对齐真实出参（《接口文档.md》七 / 五）。createTime 为毫秒时间戳。
import type { LabelToolListItem } from '@/features/labeltool/types';
import type { CreateDatasetRequest, CreateDatasetResponse, DatasetListItem } from './types';

export const MOCK_DATASETS: DatasetListItem[] = [
  { datasetId: 1042, datasetName: '医疗对话标注集', datasetDesc: '科室问诊多轮对话', labelToolCode: 'dialogue-annotator', latestVersionNumber: 3, creator: '张未明', createTime: 1780012800000 },
  { datasetId: 1041, datasetName: '通用指令流式样本', datasetDesc: '指令微调流式来源', labelToolCode: 'text-annotator', latestVersionNumber: 1, creator: '李航', createTime: 1779926400000 },
  { datasetId: 1039, datasetName: '图文理解结果集', datasetDesc: '多模态图文对', labelToolCode: 'mm-annotator', latestVersionNumber: 2, creator: '王芮', createTime: 1779840000000 },
  { datasetId: 1036, datasetName: '法律问答标注集', datasetDesc: '裁判文书问答', labelToolCode: 'text-annotator', latestVersionNumber: 5, creator: '陈思', createTime: 1779667200000 },
  { datasetId: 1033, datasetName: '代码评测流式集', datasetDesc: '代码题与单测', labelToolCode: 'text-annotator', latestVersionNumber: 1, creator: '赵铭', createTime: 1779494400000 },
  { datasetId: 1031, datasetName: '安全对齐标注集', datasetDesc: '红队对话样本', labelToolCode: 'dialogue-annotator', latestVersionNumber: 2, creator: '周岚', createTime: 1779321600000 },
  { datasetId: 1028, datasetName: '多轮对话结果集', datasetDesc: '对齐后结果回流', labelToolCode: 'dialogue-annotator', latestVersionNumber: 4, creator: '林深', createTime: 1779148800000 },
  { datasetId: 1025, datasetName: '金融研报抽取标注集', datasetDesc: '研报要素抽取', labelToolCode: 'text-annotator', latestVersionNumber: 1, creator: '何洁', createTime: 1778976000000 },
  { datasetId: 1022, datasetName: '视频字幕对齐流式集', datasetDesc: '字幕时间轴对齐', labelToolCode: 'mm-annotator', latestVersionNumber: 2, creator: '吴桐', createTime: 1778803200000 },
  { datasetId: 1019, datasetName: '知识库问答结果集', datasetDesc: '检索增强问答', labelToolCode: 'text-annotator', latestVersionNumber: 3, creator: '郑凯', createTime: 1778630400000 },
  { datasetId: 1015, datasetName: '客服对话标注集', datasetDesc: '工单会话标注', labelToolCode: 'dialogue-annotator', latestVersionNumber: 6, creator: '孙琳', createTime: 1778457600000 },
  { datasetId: 1012, datasetName: '电商评论结果集', datasetDesc: '评论情感与要素', labelToolCode: 'text-annotator', latestVersionNumber: 2, creator: '马俊', createTime: 1778284800000 },
];

/** 标注工具下拉的 mock（后端就绪后改调 getLabelToolList）。 */
export const MOCK_LABEL_TOOLS: LabelToolListItem[] = [
  { labelToolId: 1, labelToolCode: 'dialogue-annotator', labelToolName: '对话标注器', labelToolType: 1 },
  { labelToolId: 2, labelToolCode: 'text-annotator', labelToolName: '文本标注器', labelToolType: 1 },
  { labelToolId: 3, labelToolCode: 'mm-annotator', labelToolName: '多模态标注器', labelToolType: 2 },
  { labelToolId: 4, labelToolCode: 'image-annotator', labelToolName: '图像标注器', labelToolType: 2 },
];

/** 模拟文件直传：进度从 0 走到 100，约 1.6s 完成，返回假 objectKey。 */
export function mockUploadDatasetFile(
  _file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve) => {
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(100, p + Math.round(8 + Math.random() * 16));
      onProgress(p);
      if (p >= 100) {
        clearInterval(timer);
        resolve(`dataset/20260605/${Math.random().toString(36).slice(2, 10)}.jsonl`);
      }
    }, 180);
  });
}

/** 模拟创建数据集。 */
export function mockCreateDataset(_req: CreateDatasetRequest): Promise<CreateDatasetResponse> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ datasetId: 1099, versionId: 5001, versionNumber: 1 }), 500);
  });
}
