import { PostgresDatabase, getPgPool, closePgPool, SqlParameters, DbRunResult } from './postgres-client';
import { logger } from '../lib/logger';
import { runBlindBoxMigrations } from './migrations/run-migrations';

// Re-export SqlParameters so repositories that import it from here continue to work
export type { SqlParameters };

// BlindBoxDatabase is now backed by Postgres. The class name is kept so that
// all repositories (which import BlindBoxDatabase) compile without changes.
export class BlindBoxDatabase {
  private readonly pg: PostgresDatabase;

  constructor(pg: PostgresDatabase) {
    this.pg = pg;
  }

  run(sql: string, params: SqlParameters = []): Promise<DbRunResult> {
    return this.pg.run(sql, params as unknown[]);
  }

  get<T>(sql: string, params: SqlParameters = []): Promise<T | undefined> {
    return this.pg.get<T>(sql, params as unknown[]);
  }

  all<T>(sql: string, params: SqlParameters = []): Promise<T[]> {
    return this.pg.all<T>(sql, params as unknown[]);
  }

  exec(sql: string): Promise<void> {
    return this.pg.exec(sql);
  }

  transaction<T>(work: (db: BlindBoxDatabase) => Promise<T>): Promise<T> {
    return this.pg.transaction((txPg) => work(new BlindBoxDatabase(txPg)));
  }
}

let dbPromise: Promise<BlindBoxDatabase> | null = null;

function createDatabase(): Promise<BlindBoxDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const pool = getPgPool();
      const pg = new PostgresDatabase(pool, pool);
      const db = new BlindBoxDatabase(pg);
      logger.info('Blind-box database connected (Postgres)', {
        host: new URL(process.env.DATABASE_URL!).hostname,
        persistent: true,
      });
      resolve(db);
    } catch (err) {
      logger.error('Failed to initialize Postgres connection', { error: String(err) });
      reject(err);
    }
  });
}

export async function getBlindBoxDatabase(): Promise<BlindBoxDatabase> {
  if (!dbPromise) {
    dbPromise = createDatabase();
  }
  return dbPromise;
}

export async function initializeBlindBoxPersistence(): Promise<void> {
  const db = await getBlindBoxDatabase();

  // Verify connectivity before starting. Serverless Postgres (Neon, Supabase)
  // can suspend compute when idle, so the very first query after deploy may
  // race a wake-up. Retry with a wider backoff than the pool's own per-attempt
  // timeout so a slow wake-up can't crash the deploy. Total worst-case wait is
  // bounded by sum(per-attempt timeout + delays[i]); we hit the listen() call
  // FIRST in index.ts so this never threatens Render's 60s port-bind deadline.
  const maxAttempts = 5;
  const delaysMs = [3_000, 6_000, 10_000, 15_000, 20_000];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.get<{ result: number }>('SELECT 1 AS result');
      if (attempt > 1) {
        logger.info('Postgres healthcheck succeeded after retry', { attempt });
      }
      break;
    } catch (err) {
      if (attempt === maxAttempts) {
        logger.error('Postgres healthcheck failed after all retries', {
          attempts: maxAttempts,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      const delayMs = delaysMs[attempt - 1];
      logger.warn('Postgres healthcheck failed — likely cold start; retrying', {
        attempt,
        nextDelayMs: delayMs,
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  await runBlindBoxMigrations(db);
}

export async function resetBlindBoxDatabaseForTests(): Promise<void> {
  // Unlike the old per-test SQLite file, every test shares one Postgres database
  // (DATABASE_URL). A reset that only reconnected the pool left rows behind, so
  // state leaked between tests. Drop and recreate the public schema for true
  // isolation; initializeBlindBoxPersistence re-runs migrations afterwards.
  // Test-only — never invoked by the running app.
  if (process.env.DATABASE_URL) {
    try {
      const db = await getBlindBoxDatabase();
      await db.exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    } catch (err) {
      logger.warn('resetBlindBoxDatabaseForTests: schema reset failed', { error: String(err) });
    }
  }

  dbPromise = null;
  await closePgPool();
}
