import sqlite3 from 'sqlite3';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
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

function createDatabase(): Promise<BlindBoxDatabase> {
  const runtimeConfig = getRuntimeConfig();
  const databasePath = runtimeConfig.blindBoxDatabasePath;
  mkdirSync(dirname(databasePath), { recursive: true });

  return new Promise((resolve, reject) => {
    const sqlite = sqlite3.verbose();
    const database = new sqlite.Database(databasePath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      database.exec('PRAGMA foreign_keys = ON;');
      database.configure('busyTimeout', runtimeConfig.blindBoxDatabaseBusyTimeoutMs);

      logger.info('Opened blind-box database', {
        databasePath,
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
