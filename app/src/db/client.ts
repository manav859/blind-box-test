import sqlite3 from 'sqlite3';
import { dirname } from 'path';
import { existsSync, accessSync, mkdirSync, constants } from 'fs';
import { getRuntimeConfig } from '../lib/config';
import { logger } from '../lib/logger';
import { runBlindBoxMigrations } from './migrations/run-migrations';

export type SqlParameters = unknown[] | Record<string, unknown>;

export class BlindBoxDatabase {
  constructor(private readonly database: sqlite3.Database) {}

  run(sql: string, params: SqlParameters = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      this.database.run(sql, params, function onRun(err: Error | null) {
        if (err) {
          reject(err);
          return;
        }

        resolve(this);
      });
    });
  }

  get<T>(sql: string, params: SqlParameters = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.database.get(sql, params, (err: Error | null, row: T) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(row);
      });
    });
  }

  all<T>(sql: string, params: SqlParameters = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.database.all(sql, params, (err: Error | null, rows: T[]) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(rows || []);
      });
    });
  }

  exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.database.exec(sql, (err: Error | null) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  async transaction<T>(work: (db: BlindBoxDatabase) => Promise<T>): Promise<T> {
    await this.exec('BEGIN IMMEDIATE TRANSACTION');

    try {
      const result = await work(this);
      await this.exec('COMMIT');
      return result;
    } catch (error) {
      await this.exec('ROLLBACK');
      throw error;
    }
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.database.close((err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }
}

let blindBoxDatabasePromise: Promise<BlindBoxDatabase> | null = null;

function ensureBlindBoxDbDirectory(databasePath: string): void {
  const parentDir = dirname(databasePath);
  const isProduction = process.env.NODE_ENV === 'production';
  const parentExists = existsSync(parentDir);
  const fileExists = parentExists && existsSync(databasePath);

  logger.info('Blind-box DB pre-open check', {
    databasePath,
    parentDir,
    parentExists,
    fileExists,
    isProduction,
  });

  if (!parentExists) {
    if (isProduction) {
      const msg =
        `FATAL: Blind-box DB parent directory does not exist: ${parentDir}\n` +
        `DB path: ${databasePath}\n` +
        `Required fix:\n` +
        `  1. Upgrade the Render service to a paid plan (free plan does not support persistent disks)\n` +
        `  2. In the Render dashboard → blindbox-backend → Disks → Add disk:\n` +
        `       Name: blindbox-data  Mount Path: ${parentDir}  Size: 1 GB\n` +
        `  3. Set env var BLIND_BOX_DATABASE_PATH=${databasePath} in the Render dashboard → Environment\n` +
        `  4. Redeploy`;
      logger.error('Blind-box DB directory missing — persistent disk not mounted', { parentDir, databasePath });
      throw new Error(msg);
    }
    mkdirSync(parentDir, { recursive: true });
    logger.info('Blind-box DB directory created (development)', { parentDir });
    return;
  }

  try {
    accessSync(parentDir, constants.W_OK);
  } catch {
    const msg = `FATAL: Blind-box DB directory exists but is not writable: ${parentDir}`;
    logger.error(msg, { databasePath });
    throw new Error(msg);
  }

  logger.info('Blind-box DB directory ready', { parentDir, writable: true, fileExists });
}

function createDatabase(): Promise<BlindBoxDatabase> {
  const runtimeConfig = getRuntimeConfig();
  const databasePath = runtimeConfig.blindBoxDatabasePath;

  ensureBlindBoxDbDirectory(databasePath);

  return new Promise((resolve, reject) => {
    const sqlite = sqlite3.verbose();
    const database = new sqlite.Database(databasePath, (err) => {
      if (err) {
        logger.error('Failed to open blind-box database', { databasePath, error: String(err) });
        reject(err);
        return;
      }

      database.exec('PRAGMA foreign_keys = ON;');
      database.configure('busyTimeout', runtimeConfig.blindBoxDatabaseBusyTimeoutMs);

      logger.info('Blind-box database opened successfully', {
        databasePath,
        persistent: databasePath.startsWith('/var/data'),
      });

      resolve(new BlindBoxDatabase(database));
    });
  });
}

export async function getBlindBoxDatabase(): Promise<BlindBoxDatabase> {
  if (!blindBoxDatabasePromise) {
    blindBoxDatabasePromise = createDatabase();
  }

  return blindBoxDatabasePromise;
}

export async function initializeBlindBoxPersistence(): Promise<void> {
  const database = await getBlindBoxDatabase();
  await runBlindBoxMigrations(database);
}

export async function resetBlindBoxDatabaseForTests(): Promise<void> {
  if (!blindBoxDatabasePromise) {
    return;
  }

  const database = await blindBoxDatabasePromise;
  await database.close();
  blindBoxDatabasePromise = null;
}
