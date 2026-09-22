// dataset 接口函数（typed 纯函数，《接口层.md》§三）。函数名与后端接口同名。
// 路径 / 字段对齐《接口文档.md》七。空间内接口由 postScoped(Page) 自动带上 spaceCode。
import { post, postScoped, postScopedPage } from '@/shared/api/http';
import type { PageResult } from '@/types/api';
import type {
  CreateDatasetRequest,
  CreateDatasetResponse,
  CreateDatasetVersionRequest,
  CreateDatasetVersionResponse,
  DatasetDetail,
  DatasetListItem,
  GetDatasetListRequest,
  GetUploadPreSignedUrlRequest,
  GetVersionSamplePreviewResponse,
  UploadPreSignedUrl,
} from './types';

/** 数据集列表 · POST /api/dataset/getDatasetList（空间内，分页）。 */
export function getDatasetList(req: GetDatasetListRequest): Promise<PageResult<DatasetListItem>> {
  return postScopedPage<DatasetListItem>('/dataset/getDatasetList', req);
}

/** 获取上传预签名 URL · POST /api/dataset/getUploadPreSignedUrl（非空间内）。 */
export function getUploadPreSignedUrl(
  req: GetUploadPreSignedUrlRequest,
): Promise<UploadPreSignedUrl> {
  return post<UploadPreSignedUrl>('/dataset/getUploadPreSignedUrl', req);
}

/** 创建数据集 · POST /api/dataset/createDataset（空间内）。 */
export function createDataset(req: CreateDatasetRequest): Promise<CreateDatasetResponse> {
  return postScoped<CreateDatasetResponse>('/dataset/createDataset', req);
}

/** 创建数据集版本 · POST /api/dataset/createDatasetVersion（按 datasetId 定位，非空间内）。 */
export function createDatasetVersion(
  req: CreateDatasetVersionRequest,
): Promise<CreateDatasetVersionResponse> {
  return post<CreateDatasetVersionResponse>('/dataset/createDatasetVersion', req);
}

/** 数据集详情 · POST /api/dataset/getDatasetDetail。 */
export function getDatasetDetail(datasetId: number): Promise<DatasetDetail> {
  return post<DatasetDetail>('/dataset/getDatasetDetail', { datasetId });
}

/** 版本样本预览 · POST /api/dataset/getVersionSamplePreview（前 10 条，无分页）。 */
export function getVersionSamplePreview(versionId: number): Promise<GetVersionSamplePreviewResponse> {
  return post<GetVersionSamplePreviewResponse>('/dataset/getVersionSamplePreview', { versionId });
}
