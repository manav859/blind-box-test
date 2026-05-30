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
  // race a wake-up. Retry with exponential backoff so a single slow wake-up
  // doesn't crash the deploy. The pool's own connectionTimeoutMillis bounds
  // each attempt; total worst-case here is roughly attempts * (timeout + backoff).
  const maxAttempts = 3;
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
      const delayMs = 2_000 * Math.pow(2, attempt - 1); // 2s, 4s
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
  dbPromise = null;
  await closePgPool();
}
