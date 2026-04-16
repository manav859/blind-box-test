export function formatTokenLabel(value: string | null | undefined): string {
  if (!value) {
    return "Not set";
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatOptionalValue(value: string | null | undefined): string {
  if (!value) {
    return "Not set";
  }

  return value;
}
