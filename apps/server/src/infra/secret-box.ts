// 敏感配置加密（AI 配置 apiKey 等）：AES-256-GCM，密钥由 MARKFLOW_CONFIG_ENC_KEY 经 SHA-256 派生。
// 密文格式 `enc:v1:<base64url(iv ‖ tag ‖ ciphertext)>`；无前缀的值视为历史明文原样返回（兼容从 Java 版导入的数据）。
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const MIN_PASSPHRASE_LENGTH = 32;

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

export class SecretBox {
  private readonly key: Buffer;

  constructor(passphrase: string) {
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      throw new SecretBoxError(`配置加密密钥至少 ${MIN_PASSPHRASE_LENGTH} 字符`);
    }
    this.key = createHash('sha256').update(passphrase, 'utf8').digest();
  }

  static isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64url');
  }

  /** 解密；非本格式的值原样返回。密钥不匹配或密文被篡改 → SecretBoxError。 */
  decrypt(value: string): string {
    if (!SecretBox.isEncrypted(value)) return value;
    const payload = Buffer.from(value.slice(PREFIX.length), 'base64url');
    if (payload.length < IV_BYTES + TAG_BYTES) throw new SecretBoxError('密文格式错误');
    const iv = payload.subarray(0, IV_BYTES);
    const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new SecretBoxError('解密失败：密钥不匹配或密文被篡改');
    }
  }
}
