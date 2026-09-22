// 配置全部来自环境变量（zod 校验）；口令无默认值，缺失即抛错、进程退出。
import { z } from 'zod';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  LINGSHU_SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LINGSHU_LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  LINGSHU_TRUST_PROXY: z.string().default('false'),
  // 按天统计（我的贡献）使用的 IANA 时区；对应 Java JDBC serverTimezone=Asia/Shanghai。
  LINGSHU_TIMEZONE: z
    .string()
    .refine(isValidTimeZone, '不是合法的 IANA 时区名')
    .default('Asia/Shanghai'),

  LINGSHU_PG_HOST: z.string().default('127.0.0.1'),
  LINGSHU_PG_PORT: z.coerce.number().int().default(5432),
  LINGSHU_PG_DB: z.string().default('lingshu'),
  LINGSHU_PG_USER: z.string().default('lingshu'),
  LINGSHU_PG_PASSWORD: z.string().min(1),

  LINGSHU_REDIS_HOST: z.string().default('127.0.0.1'),
  LINGSHU_REDIS_PORT: z.coerce.number().int().default(6379),
  LINGSHU_REDIS_PASSWORD: z.string().min(1),

  // 首启引导用；sys_config / sys_user 已有对应记录时可省略。
  LINGSHU_JWT_SECRET: z.string().min(32, 'JWT 密钥至少 32 字符').optional(),
  LINGSHU_JWT_EXPIRE_SECONDS: z.coerce.number().int().positive().default(86400),
  LINGSHU_ADMIN_USERNAME: z.string().min(4).max(10).default('admin'),
  LINGSHU_ADMIN_INITIAL_PASSWORD: z.string().min(6, '管理员初始密码至少 6 位').optional(),

  // 敏感配置（AI apiKey 等）的 AES-256-GCM 加密密钥；更换后历史密文无法解密。
  LINGSHU_CONFIG_ENC_KEY: z.string().min(32, '配置加密密钥至少 32 字符'),

  LINGSHU_CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  LINGSHU_RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().default(600),
  LINGSHU_RATE_LIMIT_LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LINGSHU_RATE_LIMIT_LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  LINGSHU_RATE_LIMIT_WEB_VITALS_PER_MINUTE: z.coerce.number().int().positive().default(60),

  // 对象存储（S3 兼容：本地 MinIO / 线上 MinIO 或火山 TOS）。
  // ENDPOINT 供后端进程访问；PUBLIC_ENDPOINT 供浏览器直传（预签名 URL 以它签名），缺省与 ENDPOINT 相同。
  LINGSHU_S3_ENDPOINT: z.url({ error: '需为完整 URL，如 http://127.0.0.1:9000' }),
  LINGSHU_S3_PUBLIC_ENDPOINT: z.url({ error: '需为完整 URL，如 http://localhost:9000' }).optional(),
  LINGSHU_S3_REGION: z.string().min(1).default('us-east-1'),
  LINGSHU_S3_BUCKET: z.string().min(1).default('lingshu'),
  LINGSHU_S3_ACCESS_KEY: z.string().min(1),
  LINGSHU_S3_SECRET_KEY: z.string().min(1),
  // MinIO 用路径风格（/bucket/key）；虚拟主机风格端点（TOS 等）填 false。
  LINGSHU_S3_FORCE_PATH_STYLE: z.string().default('true'),

  // BullMQ 在 Redis 中的键前缀；测试库用另一个前缀隔离。
  LINGSHU_QUEUE_PREFIX: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, '只允许字母、数字、下划线、连字符')
    .default('lingshu'),
});

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  server: {
    port: number;
    logLevel: LogLevel;
    trustProxy: boolean | number | string;
    timeZone: string;
  };
  pg: { host: string; port: number; database: string; user: string; password: string };
  redis: { host: string; port: number; password: string };
  bootstrap: {
    jwtSecret: string | undefined;
    jwtExpireSeconds: number;
    adminUsername: string;
    adminInitialPassword: string | undefined;
  };
  security: { configEncKey: string };
  cors: { allowedOrigins: string[] };
  rateLimit: {
    globalPerMinute: number;
    loginMaxFailures: number;
    loginWindowMinutes: number;
    /** 公开的 Web Vitals 上报接口每 IP 每分钟上限。 */
    webVitalsPerMinute: number;
  };
  storage: {
    endpoint: string;
    publicEndpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
  };
  queue: { prefix: string };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function parseTrustProxy(raw: string): boolean | number | string {
  const v = raw.trim();
  if (v === '' || v.toLowerCase() === 'false') return false;
  if (v.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

function parseBoolean(raw: string, name: string): boolean {
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  throw new ConfigError(`环境变量配置无效：\n  ${name}: 需为 true / false`);
}

/** 去掉末尾斜杠，避免拼出 `//bucket` 形式的 URL。 */
function normalizeEndpoint(url: string): string {
  return url.replace(/\/+$/, '');
}

/** 从环境变量装配配置；空字符串视为未设置。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const input: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('LINGSHU_') && v !== undefined && v.trim() !== '') input[k] = v;
  }
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ConfigError(`环境变量配置无效：\n${lines.join('\n')}\n请对照 .env.example 补全。`);
  }
  const e = result.data;
  return {
    server: {
      port: e.LINGSHU_SERVER_PORT,
      logLevel: e.LINGSHU_LOG_LEVEL,
      trustProxy: parseTrustProxy(e.LINGSHU_TRUST_PROXY),
      timeZone: e.LINGSHU_TIMEZONE,
    },
    pg: {
      host: e.LINGSHU_PG_HOST,
      port: e.LINGSHU_PG_PORT,
      database: e.LINGSHU_PG_DB,
      user: e.LINGSHU_PG_USER,
      password: e.LINGSHU_PG_PASSWORD,
    },
    redis: {
      host: e.LINGSHU_REDIS_HOST,
      port: e.LINGSHU_REDIS_PORT,
      password: e.LINGSHU_REDIS_PASSWORD,
    },
    bootstrap: {
      jwtSecret: e.LINGSHU_JWT_SECRET,
      jwtExpireSeconds: e.LINGSHU_JWT_EXPIRE_SECONDS,
      adminUsername: e.LINGSHU_ADMIN_USERNAME,
      adminInitialPassword: e.LINGSHU_ADMIN_INITIAL_PASSWORD,
    },
    security: { configEncKey: e.LINGSHU_CONFIG_ENC_KEY },
    cors: {
      allowedOrigins: e.LINGSHU_CORS_ALLOWED_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
    rateLimit: {
      globalPerMinute: e.LINGSHU_RATE_LIMIT_GLOBAL_PER_MINUTE,
      loginMaxFailures: e.LINGSHU_RATE_LIMIT_LOGIN_MAX_FAILURES,
      loginWindowMinutes: e.LINGSHU_RATE_LIMIT_LOGIN_WINDOW_MINUTES,
      webVitalsPerMinute: e.LINGSHU_RATE_LIMIT_WEB_VITALS_PER_MINUTE,
    },
    storage: {
      endpoint: normalizeEndpoint(e.LINGSHU_S3_ENDPOINT),
      publicEndpoint: normalizeEndpoint(e.LINGSHU_S3_PUBLIC_ENDPOINT ?? e.LINGSHU_S3_ENDPOINT),
      region: e.LINGSHU_S3_REGION,
      bucket: e.LINGSHU_S3_BUCKET,
      accessKey: e.LINGSHU_S3_ACCESS_KEY,
      secretKey: e.LINGSHU_S3_SECRET_KEY,
      forcePathStyle: parseBoolean(e.LINGSHU_S3_FORCE_PATH_STYLE, 'LINGSHU_S3_FORCE_PATH_STYLE'),
    },
    queue: { prefix: e.LINGSHU_QUEUE_PREFIX },
  };
}
