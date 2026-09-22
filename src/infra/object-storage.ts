// S3 兼容对象存储（本地 MinIO；线上 MinIO 或火山 TOS 的 S3 端点），对应 Java adapter/tos/TosClient。
// 与 Java 的差异：连接配置来自环境变量（LINGSHU_S3_*）而非 sys_config[tos.config]；下载为流式而非整块读入内存。
// 两个客户端：internal 供后端进程读写（内网地址）；presigner 只用于生成预签名 URL（浏览器可达地址）——
// SigV4 会把 host 签进 URL，所以必须用浏览器最终访问的地址来签名。
// 错误码字符串沿用 Java TosErrorCode（TOS_*），保持契约不变。
import type { Readable } from 'node:stream';
import { Upload } from '@aws-sdk/lib-storage';
import {
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from './config.js';
import { defineErrorCodes, ServiceError, type ErrorCode } from './errors.js';

export const ObjectStorageErrorCode = defineErrorCodes({
  TOS_CONFIG_MISSING: '对象存储未配置',
  TOS_CONFIG_INVALID: '对象存储配置不合法',
  TOS_KEY_INVALID: '对象 key 不能为空',
  TOS_CONTENT_INVALID: '对象内容不能为空',
  TOS_UPLOAD_FAILED: '对象上传失败',
  TOS_DOWNLOAD_FAILED: '对象下载失败',
  TOS_PRESIGN_FAILED: '生成预签名 URL 失败',
});

export interface PresignedPutUrl {
  url: string;
  /** 浏览器 PUT 时需一并携带的头；SigV4 query 签名只签 host，故为空对象。 */
  signedHeaders: Record<string, string>;
  expiresInSeconds: number;
}

/** S3 错误的可读摘要（不含凭据）：`NoSuchKey: The specified key does not exist.` */
export function describeS3Error(err: unknown): string {
  if (err instanceof S3ServiceException) {
    const status = err.$metadata?.httpStatusCode;
    return `${err.name}${status ? `(${status})` : ''}: ${err.message}`;
  }
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return `${typeof code === 'string' ? code : err.name}: ${err.message}`;
  }
  return String(err);
}

function wrap(errorCode: ErrorCode, err: unknown): ServiceError {
  return ServiceError.of(errorCode, `${errorCode.message}（${describeS3Error(err)}）`, {
    cause: err,
  });
}

function requireKey(key: string): void {
  if (typeof key !== 'string' || key.trim() === '') {
    throw ServiceError.of(ObjectStorageErrorCode.TOS_KEY_INVALID);
  }
}

export class ObjectStorage {
  readonly bucket: string;
  private readonly internal: S3Client;
  private readonly presigner: S3Client;

  constructor(cfg: AppConfig['storage']) {
    this.bucket = cfg.bucket;
    const base: S3ClientConfig = {
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
      forcePathStyle: cfg.forcePathStyle,
      // 新版 SDK 默认给 PutObject 加 CRC 校验（aws-chunked 尾部校验和），
      // 会让预签名 URL 要求浏览器带 x-amz-checksum-* 头而直传失败，且部分 S3 兼容实现不支持；按需时才启用。
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    };
    this.internal = new S3Client({ ...base, endpoint: cfg.endpoint });
    this.presigner = new S3Client({ ...base, endpoint: cfg.publicEndpoint });
  }

  /** 预签名 PUT（对应 TosClient.preSignedPutUrl）：本地计算签名，不发网络请求。 */
  async presignPut(key: string, expiresInSeconds: number): Promise<PresignedPutUrl> {
    requireKey(key);
    try {
      const url = await getSignedUrl(
        this.presigner,
        new PutObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
      return { url, signedHeaders: {}, expiresInSeconds };
    } catch (err) {
      throw wrap(ObjectStorageErrorCode.TOS_PRESIGN_FAILED, err);
    }
  }

  /** 预签名 GET（导出下载；替代 Java 的公共读 URL 拼串，桶无需公共读）。 */
  async presignGet(key: string, expiresInSeconds: number): Promise<string> {
    requireKey(key);
    try {
      return await getSignedUrl(
        this.presigner,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    } catch (err) {
      throw wrap(ObjectStorageErrorCode.TOS_PRESIGN_FAILED, err);
    }
  }

  /** 流式分片上传（导出大文件用；lib-storage 每 5MB 一片，内存占用有界）。 */
  async putObjectStream(key: string, body: Readable, contentType?: string): Promise<void> {
    requireKey(key);
    try {
      const upload = new Upload({
        client: this.internal,
        params: { Bucket: this.bucket, Key: key, Body: body, ContentType: contentType },
        queueSize: 2,
        leavePartsOnError: false,
      });
      await upload.done();
    } catch (err) {
      throw wrap(ObjectStorageErrorCode.TOS_UPLOAD_FAILED, err);
    }
  }

  /** 流式下载（对应 TosClient.getObject，但不整块读入内存）；对象不存在等错误 → TOS_DOWNLOAD_FAILED。 */
  async getObjectStream(key: string): Promise<Readable> {
    requireKey(key);
    try {
      const res = await this.internal.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) throw new Error('empty response body');
      return res.Body as Readable;
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw wrap(ObjectStorageErrorCode.TOS_DOWNLOAD_FAILED, err);
    }
  }

  /** 上传（测试造数据 / M3 导出用）。 */
  async putObject(key: string, body: Buffer | string, contentType?: string): Promise<void> {
    requireKey(key);
    if (body === undefined || body === null) {
      throw ServiceError.of(ObjectStorageErrorCode.TOS_CONTENT_INVALID);
    }
    try {
      await this.internal.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (err) {
      throw wrap(ObjectStorageErrorCode.TOS_UPLOAD_FAILED, err);
    }
  }

  /** 对象是否存在（HEAD）；404 返回 false，其它错误上抛。 */
  async objectExists(key: string): Promise<boolean> {
    requireKey(key);
    try {
      await this.internal.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if (err instanceof S3ServiceException && err.$metadata?.httpStatusCode === 404) return false;
      throw wrap(ObjectStorageErrorCode.TOS_DOWNLOAD_FAILED, err);
    }
  }

  destroy(): void {
    this.internal.destroy();
    this.presigner.destroy();
  }

  /** 只读探测桶存在且凭据可访问，超时主动取消 S3 请求。 */
  async checkHealth(): Promise<void> {
    await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }), {
      abortSignal: AbortSignal.timeout(1800),
    });
  }
}
