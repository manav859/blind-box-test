export interface IdentifierValueProps {
  label: string;
  value: string | null | undefined;
  emptyLabel?: string;
}

export function IdentifierValue({
  label,
  value,
  emptyLabel = "Not set",
}: IdentifierValueProps) {
  const normalizedValue = value?.trim() || "";

  return (
    <div className="identifier-field">
      <span className="identifier-label">{label}</span>
      {normalizedValue ? (
        <div className="identifier-value-shell" title={normalizedValue}>
          <code className="identifier-value">{normalizedValue}</code>
        </div>
      ) : (
        <span className="identifier-empty">{emptyLabel}</span>
      )}
    </div>
  );
}
