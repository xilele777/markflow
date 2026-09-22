// 独立迁移入口：npm run migrate（服务启动时也会自动迁移，本脚本供部署 / 排障单独执行）。
import { loadEnvFile } from '../infra/env.js';
import { loadConfig } from '../infra/config.js';
import { createDb } from '../infra/db.js';
import { createLogger } from '../infra/logger.js';
import { migrateToLatest } from './migrator.js';

loadEnvFile();
const config = loadConfig();
const logger = createLogger(config.server.logLevel, true);
const db = createDb(config.pg, 2);

try {
  await migrateToLatest(db, logger);
  logger.info('migrations up to date');
} finally {
  await db.destroy();
}
