// 测试环境变量：读 .env 取 pg/redis/minio 连接，但库名强制 lingshu_test、队列前缀 lingshu_test、日志静默、引导参数固定。
import { loadEnvFile } from '../../src/infra/env.js';

loadEnvFile('.env');

process.env.LINGSHU_PG_DB = process.env.LINGSHU_TEST_PG_DB ?? 'lingshu_test';
process.env.LINGSHU_QUEUE_PREFIX = 'lingshu_test';
process.env.LINGSHU_LOG_LEVEL = process.env.LINGSHU_TEST_LOG_LEVEL ?? 'silent';
process.env.LINGSHU_JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef0123456789';
process.env.LINGSHU_JWT_EXPIRE_SECONDS = '3600';
process.env.LINGSHU_ADMIN_USERNAME = 'admin';
process.env.LINGSHU_ADMIN_INITIAL_PASSWORD = 'admin123456';
process.env.LINGSHU_RATE_LIMIT_LOGIN_MAX_FAILURES = '3';
process.env.LINGSHU_RATE_LIMIT_LOGIN_WINDOW_MINUTES = '1';
process.env.LINGSHU_RATE_LIMIT_GLOBAL_PER_MINUTE = '10000';
process.env.LINGSHU_CONFIG_ENC_KEY = 'test-only-config-enc-key-0123456789abcdef';
process.env.LINGSHU_TIMEZONE = 'Asia/Shanghai';
