import React from 'react';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  draft: 'Draft',
  archived: 'Archived',
  pending: 'Pending',
  assigned: 'Assigned',
  inventory_pending: 'Inv. Pending',
  inventory_processing: 'Processing',
  inventory_committed: 'Committed',
  inventory_failed: 'Failed',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  processing: 'Processing',
  received: 'Received',
  processed: 'Processed',
  ignored: 'Ignored',
  commit: 'Commit',
  reserve: 'Reserve',
  release: 'Release',
  adjustment: 'Adjustment',
};

interface StatusBadgeProps {
  status: string;
  dot?: boolean;
  label?: string;
}

export function StatusBadge({ status, dot = true, label }: StatusBadgeProps) {
  const displayLabel = label ?? STATUS_LABELS[status] ?? status;
  return (
    <span className={`badge badge-${status}`}>
      {dot && <span className="badge-dot" />}
      {displayLabel}
    </span>
  );
}
