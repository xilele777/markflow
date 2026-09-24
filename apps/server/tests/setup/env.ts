// 测试环境变量：读 .env 取 pg/redis/minio 连接，但库名强制 markflow_test、队列前缀 markflow_test、日志静默、引导参数固定。
import { loadEnvFile } from '../../src/infra/env.js';

loadEnvFile('.env');

process.env.MARKFLOW_PG_DB = process.env.MARKFLOW_TEST_PG_DB ?? 'markflow_test';
process.env.MARKFLOW_QUEUE_PREFIX = 'markflow_test';
process.env.MARKFLOW_LOG_LEVEL = process.env.MARKFLOW_TEST_LOG_LEVEL ?? 'silent';
process.env.MARKFLOW_JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef0123456789';
process.env.MARKFLOW_JWT_EXPIRE_SECONDS = '3600';
process.env.MARKFLOW_ADMIN_USERNAME = 'admin';
process.env.MARKFLOW_ADMIN_INITIAL_PASSWORD = 'admin123456';
process.env.MARKFLOW_RATE_LIMIT_LOGIN_MAX_FAILURES = '3';
process.env.MARKFLOW_RATE_LIMIT_LOGIN_WINDOW_MINUTES = '1';
process.env.MARKFLOW_RATE_LIMIT_GLOBAL_PER_MINUTE = '10000';
process.env.MARKFLOW_CONFIG_ENC_KEY = 'test-only-config-enc-key-0123456789abcdef';
process.env.MARKFLOW_TIMEZONE = 'Asia/Shanghai';
