// dataset 模块类型。对齐《接口文档.md》七（getDatasetList）。
import type { PageRequest } from '@/types/api';

/** getDatasetList 出参元素（《接口文档.md》七）。
 *  注意：列表层不含 类型 / 编号 / 样本数 / 解析状态 —— 这些在 getDatasetDetail.versions[] 里（按版本）。 */
export interface DatasetListItem {
  datasetId: number;
  datasetName: string;
  datasetDesc: string;
  /** 绑定的标注工具编码。 */
  labelToolCode: string;
  /** 最新版本号（从 1 起的整数）。 */
  latestVersionNumber: number;
  creator: string;
  createTime: number;
}

/** getDatasetList 入参（spaceCode 必填，由 http 封装自动带上，页面不重复传）。 */
export interface GetDatasetListRequest extends PageRequest {
  /** 对名称 / 描述模糊匹配。 */
  keyword?: string;
}

/** getUploadPreSignedUrl 入参（《接口文档.md》七）。 */
export interface GetUploadPreSignedUrlRequest {
  /** 原始文件名，仅用于保留后缀；最终对象 key 由后端生成。 */
  fileName: string;
}

/** getUploadPreSignedUrl 出参。 */
export interface UploadPreSignedUrl {
  /** 后端生成的对象 key；上传成功后作为 createDataset 的 ossPath。 */
  objectKey: string;
  /** 预签名 PUT URL，前端直接 PUT 文件二进制。 */
  uploadUrl: string;
  /** HTTP 方法，固定 PUT。 */
  httpMethod: string;
  /** 需随 PUT 一并携带的签名头（可能为空对象）。 */
  signedHeaders: Record<string, string>;
  /** URL 有效期（秒）。 */
  expiresInSeconds: number;
}

/** createDataset 入参（spaceCode 由 http 封装自动带上）。 */
export interface CreateDatasetRequest {
  datasetName: string;
  datasetDesc?: string;
  labelToolCode: string;
  /** 文件在 TOS 的对象 key（= 上传得到的 objectKey）。 */
  ossPath: string;
  versionDesc?: string;
}

/** createDataset 出参。 */
export interface CreateDatasetResponse {
  datasetId: number;
  versionId: number;
  versionNumber: number;
}

/** createDatasetVersion 入参（无 spaceCode，按 datasetId 定位）。 */
export interface CreateDatasetVersionRequest {
  datasetId: number;
  /** 文件对象 key（= 上传得到的 objectKey）。 */
  ossPath: string;
  versionDesc?: string;
}

/** createDatasetVersion 出参。 */
export interface CreateDatasetVersionResponse {
  versionId: number;
  versionNumber: number;
}

/** 解析统计 + 失败明细（parseExt）。未解析为 null。 */
export interface ParseExt {
  totalRowCount: number;
  successRowCount: number;
  skippedRowCount: number;
  sampleErrors: { rowNumber: number; error: string }[];
  parseFailureReason: string | null;
}

/** getDatasetDetail.versions[] 元素。 */
export interface DatasetVersion {
  versionId: number;
  versionNumber: number;
  versionDesc: string;
  /** 解析状态：1=解析中, 2=已就绪, 3=解析失败（UPLOAD_STATUS）。 */
  uploadStatus: number;
  sampleCount: number;
  creator: string;
  createTime: number;
  parseExt: ParseExt | null;
}

/** getDatasetDetail 出参。 */
export interface DatasetDetail {
  datasetId: number;
  spaceCode: string;
  datasetName: string;
  datasetDesc: string;
  labelToolCode: string;
  latestVersionNumber: number;
  creator: string;
  createTime: number;
  versions: DatasetVersion[];
}

/** getVersionSamplePreview list 元素（最多 10 条）。 */
export interface VersionSample {
  id: number;
  /** 业务 id（可空）。 */
  bizId: string | null;
  /** 原始样本内容。 */
  sampleData: unknown;
}

/** getVersionSamplePreview 出参。 */
export interface GetVersionSamplePreviewResponse {
  list: VersionSample[];
}
