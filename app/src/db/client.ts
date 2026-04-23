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
  // Verify connectivity before starting
  await db.get<{ result: number }>('SELECT 1 AS result');
  await runBlindBoxMigrations(db);
}

export async function resetBlindBoxDatabaseForTests(): Promise<void> {
  dbPromise = null;
  await closePgPool();
}
