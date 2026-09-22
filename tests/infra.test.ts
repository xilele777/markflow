import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommonErrorCode, ServiceError } from '../src/infra/errors.js';
import { RedisLock } from '../src/infra/lock.js';
import { SecretBox, SecretBoxError } from '../src/infra/secret-box.js';
import { createTestHarness, type TestHarness } from './helpers/app.js';

const KEY = 'unit-test-passphrase-0123456789abcdef-xyz';

describe('SecretBox（AES-256-GCM）', () => {
  const box = new SecretBox(KEY);

  it('加解密往返；密文带 enc:v1: 前缀且随机 IV 使两次密文不同', () => {
    const c1 = box.encrypt('sk-secret-key');
    const c2 = box.encrypt('sk-secret-key');
    expect(c1.startsWith('enc:v1:')).toBe(true);
    expect(c1).not.toBe(c2);
    expect(box.decrypt(c1)).toBe('sk-secret-key');
    expect(box.decrypt(c2)).toBe('sk-secret-key');
    expect(SecretBox.isEncrypted(c1)).toBe(true);
  });

  it('非本格式的值（历史明文）原样返回', () => {
    expect(box.decrypt('plain-legacy-key')).toBe('plain-legacy-key');
    expect(SecretBox.isEncrypted('plain-legacy-key')).toBe(false);
  });

  it('篡改密文 / 密钥不匹配 → SecretBoxError', () => {
    const cipher = box.encrypt('hello');
    const tampered = cipher.slice(0, -2) + (cipher.endsWith('AA') ? 'BB' : 'AA');
    expect(() => box.decrypt(tampered)).toThrow(SecretBoxError);
    expect(() => new SecretBox('another-passphrase-0123456789abcdef-xyz').decrypt(cipher)).toThrow(
      SecretBoxError,
    );
  });

  it('密钥过短 → 拒绝构造', () => {
    expect(() => new SecretBox('short')).toThrow(SecretBoxError);
  });
});

describe('RedisLock', () => {
  let h: TestHarness;
  let lock: RedisLock;

  beforeAll(async () => {
    h = await createTestHarness();
    lock = new RedisLock(h.ctx.redis, h.ctx.logger);
  });
  afterAll(() => h.close());

  it('同名锁互斥；释放后可再获取；释放只认自己的凭证', async () => {
    const name = `t:${Date.now()}`;
    const token = await lock.tryLock(name, { waitMs: 0, leaseMs: 5000 });
    expect(token).toBeTruthy();
    expect(await lock.tryLock(name, { waitMs: 100, leaseMs: 5000 })).toBeNull();
    await lock.unlock(name, 'not-my-token');
    expect(await lock.tryLock(name, { waitMs: 0, leaseMs: 5000 })).toBeNull();
    await lock.unlock(name, token as string);
    const again = await lock.tryLock(name, { waitMs: 0, leaseMs: 5000 });
    expect(again).toBeTruthy();
    await lock.unlock(name, again as string);
  });

  it('withLock：拿不到锁抛指定错误码；fn 结束后释放', async () => {
    const name = `w:${Date.now()}`;
    const held = await lock.tryLock(name, { waitMs: 0, leaseMs: 5000 });
    await expect(
      lock.withLock(name, CommonErrorCode.TOO_MANY_REQUESTS, async () => 'x', {
        waitMs: 50,
        leaseMs: 5000,
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    await lock.unlock(name, held as string);

    const result = await lock.withLock(name, CommonErrorCode.TOO_MANY_REQUESTS, async () => 'done');
    expect(result).toBe('done');
    const free = await lock.tryLock(name, { waitMs: 0, leaseMs: 1000 });
    expect(free).toBeTruthy();
    await lock.unlock(name, free as string);
  });

  it('lease 到期自动释放', async () => {
    const name = `l:${Date.now()}`;
    expect(await lock.tryLock(name, { waitMs: 0, leaseMs: 150 })).toBeTruthy();
    const acquired = await lock.tryLock(name, { waitMs: 1000, leaseMs: 1000 });
    expect(acquired).toBeTruthy();
    await lock.unlock(name, acquired as string);
  });

  it('withLock 内抛出的业务异常原样透出', async () => {
    await expect(
      lock.withLock(`e:${Date.now()}`, CommonErrorCode.TOO_MANY_REQUESTS, async () => {
        throw ServiceError.of(CommonErrorCode.NOT_FOUND);
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
