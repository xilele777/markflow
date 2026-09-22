// 数据集域枚举与 ext 结构（后端索引 §4.1 / §2.5）。

/** DatasetTypeEnum：ANNOTATION=1（源数据集）, STREAM_ANNOTATION=2, RESULT=3（标注结果集，M3 lazy 创建，不出现在列表）。 */
export const DatasetType = { ANNOTATION: 1, STREAM_ANNOTATION: 2, RESULT: 3 } as const;
export type DatasetTypeCode = (typeof DatasetType)[keyof typeof DatasetType];

/** UploadStatusEnum：PARSING=1, READY=2, PARSE_FAILED=3。 */
export const UploadStatus = { PARSING: 1, READY: 2, PARSE_FAILED: 3 } as const;
export type UploadStatusCode = (typeof UploadStatus)[keyof typeof UploadStatus];

/** FileTypeEnum：一期仅 jsonl（每行一个 JSON 对象 = 一条样本）。 */
export const FileType = { JSONL: 'jsonl' } as const;
export type FileTypeCode = (typeof FileType)[keyof typeof FileType];

/** 按 ossPath 后缀识别文件类型（大小写不敏感）；无后缀 / 不支持返回 null。 */
export function fileTypeFromOssPath(ossPath: string | null | undefined): FileTypeCode | null {
  if (!ossPath) return null;
  const dot = ossPath.lastIndexOf('.');
  if (dot < 0 || dot === ossPath.length - 1) return null;
  const suffix = ossPath.slice(dot + 1).toLowerCase();
  return suffix === FileType.JSONL ? FileType.JSONL : null;
}

export interface SampleError {
  /** 行号（从 1 开始，不含空行）。 */
  rowNumber: number;
  error: string;
}

/**
 * lingshu_dataset_version.ext（对应 Java DatasetVersionExt）。
 * 解析成功写统计与错误明细（parseFailureReason 为 null）；解析失败只写 parseFailureReason，其余为 null。
 */
export interface DatasetVersionExt {
  /** 总行数（解析成功 + 失败，不含空行）。 */
  totalRowCount: number | null;
  /** schema 校验通过、成功入库的行数。 */
  successRowCount: number | null;
  /** 跳过行数（JSON 解析失败 + schema 校验失败）。 */
  skippedRowCount: number | null;
  /** 错误明细（上限 100 条，超出只计数）。 */
  sampleErrors: SampleError[] | null;
  /** 整体解析失败原因；成功时为 null。 */
  parseFailureReason: string | null;
}
