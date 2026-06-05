import { Pool, PoolClient } from 'pg';
import { logger } from '../lib/logger';

export type SqlParameters = unknown[] | Record<string, unknown>;

export interface DbRunResult {
  changes: number;
  lastID: number;
}

// Converts SQLite-style ? positional placeholders to Postgres $1 $2 ... style.
// Repositories were written for SQLite; this lets them work against Postgres unchanged.
function toPgSql(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

type PgExecutor = Pool | PoolClient;

export class PostgresDatabase {
  constructor(
    private readonly executor: PgExecutor,
    private readonly _pool: Pool,
  ) {}

  async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
    const result = await this.executor.query(toPgSql(sql), params);
    return { changes: result.rowCount ?? 0, lastID: 0 };
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.executor.query(toPgSql(sql), params);
    return result.rows[0] as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.executor.query(toPgSql(sql), params);
    return result.rows as T[];
  }

  async exec(sql: string): Promise<void> {
    await this.executor.query(sql);
  }

  async transaction<T>(work: (db: PostgresDatabase) => Promise<T>): Promise<T> {
    const client = await this._pool.connect();
    const txDb = new PostgresDatabase(client, this._pool);
    try {
      await client.query('BEGIN');
      const result = await work(txDb);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

let pool: Pool | null = null;

/**
 * Strip any `sslmode=` directive from the URL. We always set `ssl` explicitly
 * in the Pool config below (`rejectUnauthorized: false`), which takes
 * precedence. Leaving sslmode in the URL causes pg-connection-string to emit a
 * deprecation warning that the next major version will treat sslmode=require
 * as verify-full. Removing it silences the warning and removes the duplication.
 */
function stripSslModeFromConnectionString(input: string): string {
  try {
    const url = new URL(input);
    if (url.searchParams.has('sslmode')) {
      url.searchParams.delete('sslmode');
      return url.toString();
    }
    return input;
  } catch {
    return input;
  }
}

/** Credential-redacted form, safe to log. */
function redactConnectionString(input: string): string {
  return input.replace(/:\/\/[^@/]+@/, '://***@').slice(0, 80);
}

export function getPgPool(): Pool {
  if (pool) return pool;

  const rawConnectionString = process.env.DATABASE_URL;
  if (!rawConnectionString) {
    throw new Error('DATABASE_URL is required. Set it in Render dashboard → Environment.');
  }

  const connectionString = stripSslModeFromConnectionString(rawConnectionString);
  logger.info('Postgres pool initializing', {
    databaseUrl: redactConnectionString(connectionString),
    sslModeStripped: connectionString !== rawConnectionString,
  });

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    max: 5,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected Postgres pool error', { error: err.message });
  });

  return pool;
}

/**
 * Periodically pings the database with `SELECT 1` so Neon / Supabase free-tier
 * compute doesn't suspend during idle windows. Errors are swallowed silently —
 * a real outage will surface on the next user request, where retries apply.
 * Should be started AFTER the boot healthcheck succeeds.
 */
export function startDatabaseKeepAlive(targetPool: Pool): void {
  setInterval(async () => {
    try {
      await targetPool.query('SELECT 1');
    } catch {
      /* silent — next user query surfaces the real error */
    }
  }, 4 * 60 * 1000);
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
