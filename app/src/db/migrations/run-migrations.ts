import { BlindBoxDatabase } from '../client';
import { INITIAL_FOUNDATION_MIGRATION } from '../schema/initial-foundation';
import { INVENTORY_RECOVERY_HARDENING_MIGRATION } from '../schema/002_inventory_recovery_hardening';
import { COLLECTION_REWARD_GROUPS_MIGRATION } from '../schema/003_collection_reward_groups';
import { logger } from '../../lib/logger';

interface AppliedMigrationRow {
  name: string;
}

const MIGRATIONS = [
  INITIAL_FOUNDATION_MIGRATION,
  INVENTORY_RECOVERY_HARDENING_MIGRATION,
  COLLECTION_REWARD_GROUPS_MIGRATION,
];

async function ensureMigrationTable(db: BlindBoxDatabase): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

export async function runBlindBoxMigrations(db: BlindBoxDatabase): Promise<void> {
  await ensureMigrationTable(db);

  const appliedMigrations = await db.all<AppliedMigrationRow>('SELECT name FROM schema_migrations');
  const appliedMigrationSet = new Set(appliedMigrations.map((migration) => migration.name));

  for (const migration of MIGRATIONS) {
    if (appliedMigrationSet.has(migration.name)) {
      continue;
    }

    await db.transaction(async (transaction) => {
      await transaction.exec(migration.sql);
      await transaction.run(
        'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
        [migration.name, new Date().toISOString()],
      );
    });

    logger.info('Applied blind-box migration', {
      migration: migration.name,
    });
  }
}
