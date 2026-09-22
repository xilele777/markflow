import { Redis } from 'ioredis';
import type { AppConfig } from './config.js';

export type { Redis };

export function createRedis(cfg: AppConfig['redis']): Redis {
  return new Redis({
    host: cfg.host,
    port: cfg.port,
    password: cfg.password,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
  });
}
