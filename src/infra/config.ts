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
  rateLimit: { globalPerMinute: number; loginMaxFailures: number; loginWindowMinutes: number };
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
    },
  };
}
