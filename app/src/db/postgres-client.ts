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

export function getPgPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Set it in Render dashboard → Environment.');
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected Postgres pool error', { error: err.message });
  });

  return pool;
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
