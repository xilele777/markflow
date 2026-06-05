// 数据集文件直传 TOS（火山引擎）：① 取预签名 URL → ② 浏览器 XHR PUT 直传（文件不经后端）。
// 见 memory/dataset-upload-approach.md。上传成功返回 objectKey，作为 createDataset 的 ossPath。
import { getUploadPreSignedUrl } from './api';

// 浏览器禁止 JS 设置的请求头（设了会被忽略并告警）。TOS 预签名常把这些放进 signedHeaders，
// 但实际签名通常只签 host（浏览器自动带），故这些可安全跳过。
const FORBIDDEN_HEADERS = new Set([
  'host',
  'user-agent',
  'content-length',
  'connection',
  'origin',
  'referer',
  'date',
  'accept-encoding',
  'accept-charset',
  'cookie',
]);

/** 用 XHR PUT 把文件直传到预签名 URL，回报上传进度（0-100）。 */
function putFile(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    // 携带后端要求的签名头（可能为空对象）；跳过浏览器禁止设置的头。
    Object.entries(headers ?? {}).forEach(([k, v]) => {
      if (!FORBIDDEN_HEADERS.has(k.toLowerCase())) xhr.setRequestHeader(k, v);
    });
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`上传失败（${xhr.status}）`));
    };
    xhr.onerror = () => reject(new Error('上传失败，请检查网络后重试'));
    xhr.send(file);
  });
}

/**
 * 直传一个文件，返回对象 key（objectKey）。
 * @param onProgress 进度回调（0-100）
 */
export async function uploadDatasetFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  const presigned = await getUploadPreSignedUrl({ fileName: file.name });
  await putFile(presigned.uploadUrl, file, presigned.signedHeaders, onProgress);
  return presigned.objectKey;
}
