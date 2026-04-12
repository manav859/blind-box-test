export function nowIsoString(): string {
  return new Date().toISOString();
}

export function normalizeNullableString(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

export function sqliteVariantKey(value: string | null | undefined): string {
  return value || '';
}

export function isSqliteUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('unique constraint failed');
}
