export function nowIsoString(): string {
  return new Date().toISOString();
}

export function normalizeNullableString(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

export function sqliteVariantKey(value: string | null | undefined): string {
  return value || '';
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Postgres: unique_violation (SQLSTATE 23505)
  if ((error as NodeJS.ErrnoException & { code?: string }).code === '23505') return true;
  // SQLite legacy pattern (kept for local dev if needed)
  return error.message.toLowerCase().includes('unique constraint failed');
}

// Alias kept so all existing repository imports compile without changes
export const isSqliteUniqueConstraintError = isUniqueConstraintError;
