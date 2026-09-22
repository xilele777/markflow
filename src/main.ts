// 进程入口：读 .env → 校验配置 → 连接 pg/redis → 迁移到最新 → 首启引导 → 监听。任一步失败即退出（非 0）。
import { createApp } from './app/create-app.js';
import { createContext, destroyContext } from './app/context.js';
import { migrateToLatest } from './db/migrator.js';
import { BootstrapError, runBootstrap } from './infra/bootstrap.js';
import { ConfigError, loadConfig } from './infra/config.js';
import { loadEnvFile } from './infra/env.js';

const SHUTDOWN_GRACE_MS = 10_000;

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const ctx = await createContext(config);
  const { logger } = ctx;

  try {
    await migrateToLatest(ctx.db, logger);
    await runBootstrap(ctx);
  } catch (err) {
    if (err instanceof BootstrapError) logger.fatal(err.message);
    else logger.fatal({ err }, 'startup failed');
    await destroyContext(ctx);
    process.exit(1);
  }

  const app = createApp(ctx);
  const server = app.listen(config.server.port, () => {
    logger.info({ port: config.server.port }, 'lingshu-server listening');
  });

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      destroyContext(ctx)
        .catch((err) => logger.warn({ err }, 'destroyContext failed'))
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError || err instanceof BootstrapError) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
