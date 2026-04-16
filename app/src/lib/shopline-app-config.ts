import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

export interface ResolvedShoplineAppConfig {
  appKey: string;
  appSecret: string;
  appUrl: string;
  scopes: string[];
}

function readEnvString(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : null;
}

function parseTomlString(contents: string, key: string): string | null {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"\\s*$`, 'm');
  const match = contents.match(pattern);
  return match?.[1]?.trim() || null;
}

function parseScopeList(value: string | null): string[] {
  return (value || '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function normalizeAppUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function getCandidateTomlPaths(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  const primaryPath = resolve(directory, 'shopline.app.toml');
  const linkedPaths = readdirSync(directory)
    .filter((entry) => /^shopline\.app\..+\.toml$/i.test(entry))
    .sort()
    .map((entry) => resolve(directory, entry));

  const candidatePaths: string[] = [];

  if (existsSync(primaryPath)) {
    candidatePaths.push(primaryPath);
  }

  for (const linkedPath of linkedPaths) {
    if (linkedPath !== primaryPath) {
      candidatePaths.push(linkedPath);
    }
  }

  return candidatePaths;
}

function readTomlFallback(): {
  appKey: string | null;
  appSecret: string | null;
  appUrl: string | null;
  scopes: string[];
} {
  const candidateDirectories = [
    resolve(process.cwd()),
    resolve(process.cwd(), '..'),
  ];

  for (const candidateDirectory of candidateDirectories) {
    const candidatePaths = getCandidateTomlPaths(candidateDirectory);

    if (candidatePaths.length === 0) {
      continue;
    }

    return candidatePaths.reduce(
      (resolvedConfig, candidatePath) => {
        const contents = readFileSync(candidatePath, 'utf8');

        return {
          appKey: parseTomlString(contents, 'appKey') || resolvedConfig.appKey,
          appSecret:
            parseTomlString(contents, 'appSecret') || resolvedConfig.appSecret,
          appUrl:
            normalizeAppUrl(parseTomlString(contents, 'appUrl')) ||
            resolvedConfig.appUrl,
          scopes: (() => {
            const parsedScopes = parseScopeList(parseTomlString(contents, 'scopes'));
            return parsedScopes.length > 0 ? parsedScopes : resolvedConfig.scopes;
          })(),
        };
      },
      {
        appKey: null,
        appSecret: null,
        appUrl: null,
        scopes: [] as string[],
      },
    );
  }

  return {
    appKey: null,
    appSecret: null,
    appUrl: null,
    scopes: [],
  };
}

function assertRequiredSecrets(config: ResolvedShoplineAppConfig): void {
  const missingEnvVars: string[] = [];

  if (!config.appSecret) {
    missingEnvVars.push('SHOPLINE_APP_SECRET');
  }

  if (!config.appUrl) {
    missingEnvVars.push('SHOPLINE_APP_URL or shopline.app.toml appUrl');
  }

  if (!config.appKey) {
    missingEnvVars.push('SHOPLINE_APP_KEY or shopline.app.toml appKey');
  }

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required SHOPLINE app configuration: ${missingEnvVars.join(
        ', ',
      )}. Start the app from the repo root with "npm run dev" so the SHOPLINE CLI injects runtime env, or export the missing values before running the backend workspace directly.`,
    );
  }
}

export function resolveShoplineAppConfig(): ResolvedShoplineAppConfig {
  const tomlFallback = readTomlFallback();

  const config: ResolvedShoplineAppConfig = {
    appKey: readEnvString('SHOPLINE_APP_KEY') || tomlFallback.appKey || '',
    appSecret: readEnvString('SHOPLINE_APP_SECRET') || tomlFallback.appSecret || '',
    appUrl:
      normalizeAppUrl(readEnvString('SHOPLINE_APP_URL')) ||
      tomlFallback.appUrl ||
      '',
    scopes:
      (readEnvString('SCOPES') || '')
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean) || tomlFallback.scopes,
  };

  if (config.scopes.length === 0) {
    config.scopes = tomlFallback.scopes;
  }

  assertRequiredSecrets(config);
  return config;
}
