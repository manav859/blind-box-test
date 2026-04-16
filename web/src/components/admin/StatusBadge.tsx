import { formatTokenLabel } from "../../utils/format";

const toneByStatus: Record<string, string> = {
  active: "badge-success",
  draft: "badge-warning",
  archived: "badge-neutral",
  assigned: "badge-success",
  inventory_processing: "badge-info",
  pending: "badge-warning",
  processing: "badge-info",
  inventory_pending: "badge-warning",
  inventory_committed: "badge-success",
  inventory_failed: "badge-danger",
  succeeded: "badge-success",
  ready: "badge-success",
  received: "badge-neutral",
  ignored: "badge-neutral",
  failed: "badge-danger",
  cancelled: "badge-neutral",
  uniform: "badge-info",
  weighted: "badge-info",
  execute: "badge-info",
  deferred: "badge-neutral",
  reserve: "badge-info",
  commit: "badge-info",
  release: "badge-info",
  adjustment: "badge-info",
  enabled: "badge-success",
  disabled: "badge-neutral",
  inventory: "badge-danger",
  webhook: "badge-warning",
  missing_location: "badge-warning",
  missing_variant: "badge-warning",
  missing_inventory_item: "badge-warning",
  untracked_inventory: "badge-danger",
  location_linkage_missing: "badge-warning",
  scope_config_issue: "badge-danger",
  admin_session_required: "badge-warning",
  needs_review: "badge-warning",
  action_required: "badge-warning",
};

export interface StatusBadgeProps {
  value: string;
}

export function StatusBadge({ value }: StatusBadgeProps) {
  const toneClassName = toneByStatus[value] || "badge-neutral";

  return (
    <span className={`status-badge ${toneClassName}`}>
      {formatTokenLabel(value)}
    </span>
  );
}
