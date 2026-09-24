// Kysely Migrator。迁移以静态表注册（不用 FileMigrationProvider，避免打包后按文件系统扫描）。
// 新增迁移：在 migrations/ 建 NNNN_name.ts 并在下方 MIGRATIONS 追加，键名按字典序递增。
import type { Kysely } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import type { Logger } from '../infra/logger.js';
import * as m0001 from './migrations/0001_init.js';
import * as m0002 from './migrations/0002_dataset_unique_name.js';
import * as m0003 from './migrations/0003_mq_outbox.js';
import * as m0004 from './migrations/0004_web_vitals.js';
import * as m0005 from './migrations/0005_notification.js';
import * as m0006 from './migrations/0006_markflow_names.js';

// Kysely 的 Migration 接口要求 Kysely<any>：迁移不依赖表类型。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

const MIGRATIONS: Record<string, Migration> = {
  '0001_init': m0001,
  '0002_dataset_unique_name': m0002,
  '0003_mq_outbox': m0003,
  '0004_web_vitals': m0004,
  '0005_notification': m0005,
  '0006_markflow_names': m0006,
};

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return MIGRATIONS;
  }
}

export function createMigrator(db: AnyDb): Migrator {
  return new Migrator({ db, provider: new StaticMigrationProvider() });
}

export async function migrateToLatest(db: AnyDb, logger: Logger): Promise<void> {
  const { error, results } = await createMigrator(db).migrateToLatest();
  for (const r of results ?? []) {
    logger.info({ migration: r.migrationName, status: r.status }, 'db migration');
  }
  if (error) throw error;
}
