import 'dotenv/config';

export interface RuntimeConfig {
  blindBoxDatabasePath: string;
  blindBoxDatabaseBusyTimeoutMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  blindBoxInventoryExecutionMode: 'deferred' | 'execute';
  shoplineAdminApiVersion: string;
  shoplineConfiguredScopes: string[];
  blindBoxShoplineLocationId: string | null;
}

const DEFAULT_BLIND_BOX_DATABASE_PATH = `${process.cwd()}/blind-box-domain.sqlite`;
const DEFAULT_SQLITE_BUSY_TIMEOUT_MS = 5_000;
const DEFAULT_LOG_LEVEL: RuntimeConfig['logLevel'] = 'info';
const VALID_LOG_LEVELS: RuntimeConfig['logLevel'][] = ['debug', 'info', 'warn', 'error'];
const DEFAULT_SHOPLINE_ADMIN_API_VERSION = 'v20230901';

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

function readScopeListEnv(): string[] {
  return (process.env.SCOPES || '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function getRuntimeConfig(): RuntimeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const rawMode = (process.env.BLIND_BOX_INVENTORY_EXECUTION_MODE || '').trim().toLowerCase();
  if (rawMode !== 'execute' && rawMode !== 'deferred') {
    throw new Error(
      'BLIND_BOX_INVENTORY_EXECUTION_MODE is required and must be "execute" or "deferred". ' +
      'Set this env var before starting the server.',
    );
  }

  const executionMode = rawMode as RuntimeConfig['blindBoxInventoryExecutionMode'];

  if (executionMode === 'execute' && !process.env.BLIND_BOX_SHOPLINE_LOCATION_ID) {
    throw new Error(
      'BLIND_BOX_SHOPLINE_LOCATION_ID is required when BLIND_BOX_INVENTORY_EXECUTION_MODE=execute. ' +
      'Find your location ID in SHOPLINE admin → Settings → Locations.',
    );
  }

  cachedConfig = {
    blindBoxDatabasePath: process.env.BLIND_BOX_DATABASE_PATH || DEFAULT_BLIND_BOX_DATABASE_PATH,
    blindBoxDatabaseBusyTimeoutMs: readNumberEnv(
      'BLIND_BOX_DATABASE_BUSY_TIMEOUT_MS',
      DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
    ),
    logLevel: readLogLevelEnv(),
    blindBoxInventoryExecutionMode: executionMode,
    shoplineAdminApiVersion: process.env.SHOPLINE_ADMIN_API_VERSION || DEFAULT_SHOPLINE_ADMIN_API_VERSION,
    shoplineConfiguredScopes: readScopeListEnv(),
    blindBoxShoplineLocationId: process.env.BLIND_BOX_SHOPLINE_LOCATION_ID || null,
  };

  return cachedConfig;
}

export function resetRuntimeConfigForTests(): void {
  cachedConfig = null;
}
