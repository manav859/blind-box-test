export const DEFAULT_BACKEND_PORT = 3001;

export interface ResolvedBackendPort {
  port: number;
  source: 'BACKEND_PORT' | 'PORT' | 'default';
  invalidSources: Array<{
    name: 'BACKEND_PORT' | 'PORT';
    value: string;
  }>;
}

function parsePort(value: string): number | null {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  if (!Number.isInteger(parsedValue) || parsedValue < 0 || parsedValue >= 65_536) {
    return null;
  }

  return parsedValue;
}

export function resolveBackendPort(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedBackendPort {
  const invalidSources: ResolvedBackendPort['invalidSources'] = [];
  const candidates: Array<{ name: 'BACKEND_PORT' | 'PORT'; value: string | undefined }> = [
    {
      name: 'BACKEND_PORT',
      value: env.BACKEND_PORT,
    },
    {
      name: 'PORT',
      value: env.PORT,
    },
  ];

  for (const candidate of candidates) {
    if (typeof candidate.value !== 'string') {
      continue;
    }

    const parsedPort = parsePort(candidate.value);
    if (parsedPort !== null) {
      return {
        port: parsedPort,
        source: candidate.name,
        invalidSources,
      };
    }

    invalidSources.push({
      name: candidate.name,
      value: candidate.value,
    });
  }

  return {
    port: DEFAULT_BACKEND_PORT,
    source: 'default',
    invalidSources,
  };
}
