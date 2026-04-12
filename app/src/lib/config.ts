import 'dotenv/config';

export interface RuntimeConfig {
  blindBoxDatabasePath: string;
  blindBoxDatabaseBusyTimeoutMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  blindBoxInventoryExecutionMode: 'deferred' | 'execute';
}

const DEFAULT_BLIND_BOX_DATABASE_PATH = `${process.cwd()}/blind-box-domain.sqlite`;
const DEFAULT_SQLITE_BUSY_TIMEOUT_MS = 5_000;
const DEFAULT_LOG_LEVEL: RuntimeConfig['logLevel'] = 'info';
const VALID_LOG_LEVELS: RuntimeConfig['logLevel'][] = ['debug', 'info', 'warn', 'error'];

let cachedConfig: RuntimeConfig | null = null;

function readNumberEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

function readLogLevelEnv(): RuntimeConfig['logLevel'] {
  const rawValue = (process.env.LOG_LEVEL || '').toLowerCase() as RuntimeConfig['logLevel'];
  return VALID_LOG_LEVELS.includes(rawValue) ? rawValue : DEFAULT_LOG_LEVEL;
}

export function getRuntimeConfig(): RuntimeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = {
    blindBoxDatabasePath: process.env.BLIND_BOX_DATABASE_PATH || DEFAULT_BLIND_BOX_DATABASE_PATH,
    blindBoxDatabaseBusyTimeoutMs: readNumberEnv(
      'BLIND_BOX_DATABASE_BUSY_TIMEOUT_MS',
      DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
    ),
    logLevel: readLogLevelEnv(),
    blindBoxInventoryExecutionMode:
      process.env.BLIND_BOX_INVENTORY_EXECUTION_MODE === 'execute' ? 'execute' : 'deferred',
  };

  return cachedConfig;
}

export function resetRuntimeConfigForTests(): void {
  cachedConfig = null;
}
