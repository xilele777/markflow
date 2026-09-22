// pino 日志。任何日志都不得打印 token / 密码 / apiKey：这里对常见字段做脱敏。
// err 序列化器加兜底：序列化异常对象本身出错时退化为 {type, message, stack}，日志永远不能让业务流程中断。
import { pino, stdSerializers, type DestinationStream, type Logger } from 'pino';

export type { Logger };

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  'oldPassword',
  '*.oldPassword',
  'newPassword',
  '*.newPassword',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'apiKey',
  '*.apiKey',
];

function safeErrSerializer(err: unknown): unknown {
  try {
    return stdSerializers.err(err as Error);
  } catch {
    const e = (err ?? {}) as { name?: unknown; message?: unknown; stack?: unknown };
    return {
      type: typeof e.name === 'string' ? e.name : 'Error',
      message: typeof e.message === 'string' ? e.message : String(err),
      stack: typeof e.stack === 'string' ? e.stack : undefined,
      serializerFailed: true,
    };
  }
}

/** destination 仅测试用（捕获输出）；给定时忽略 pretty。 */
export function createLogger(
  level: string,
  pretty = false,
  destination?: DestinationStream,
): Logger {
  const options = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    serializers: { err: safeErrSerializer },
  };
  if (destination) return pino(options, destination);
  return pino({
    ...options,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' },
          },
        }
      : {}),
  });
}
