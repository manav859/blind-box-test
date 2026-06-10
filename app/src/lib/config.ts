import 'dotenv/config';

export interface RuntimeConfig {
  databaseUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  blindBoxInventoryExecutionMode: 'deferred' | 'execute';
  shoplineAdminApiVersion: string;
  shoplineConfiguredScopes: string[];
  blindBoxShoplineLocationId: string | null;
}

const DEFAULT_LOG_LEVEL: RuntimeConfig['logLevel'] = 'info';
const VALID_LOG_LEVELS: RuntimeConfig['logLevel'][] = ['debug', 'info', 'warn', 'error'];
const DEFAULT_SHOPLINE_ADMIN_API_VERSION = 'v20260901';

let cachedConfig: RuntimeConfig | null = null;

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

  // BLIND_BOX_SHOPLINE_LOCATION_ID is OPTIONAL even in execute mode. The location
  // is resolved per shop at decrement time (variant-stock → default → single
  // active); the env is only a dev override. Never block startup on it — just
  // emit a soft INFO signal. (console.info, not the logger, to avoid the
  // logger → getRuntimeConfig import cycle.)
  if (executionMode === 'execute' && !process.env.BLIND_BOX_SHOPLINE_LOCATION_ID) {
    console.info(
      '[config] execute mode with no BLIND_BOX_SHOPLINE_LOCATION_ID — resolving inventory location per shop at decrement time.',
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Set the Neon connection string in Render dashboard → Environment.',
    );
  }

  cachedConfig = {
    databaseUrl,
    logLevel: readLogLevelEnv(),
    blindBoxInventoryExecutionMode: executionMode,
    // Accept SHOPLINE_API_VERSION (short alias) or SHOPLINE_ADMIN_API_VERSION (legacy).
    shoplineAdminApiVersion:
      process.env.SHOPLINE_API_VERSION ||
      process.env.SHOPLINE_ADMIN_API_VERSION ||
      DEFAULT_SHOPLINE_ADMIN_API_VERSION,
    shoplineConfiguredScopes: readScopeListEnv(),
    blindBoxShoplineLocationId: process.env.BLIND_BOX_SHOPLINE_LOCATION_ID || null,
  };

  return cachedConfig;
}

export function resetRuntimeConfigForTests(): void {
  cachedConfig = null;
}
