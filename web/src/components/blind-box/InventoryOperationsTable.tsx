import { DataTable } from "../admin/DataTable";
import { StatusBadge } from "../admin/StatusBadge";
import { formatDateTime, formatOptionalValue } from "../../utils/format";
import type {
  BlindBoxAssignment,
  BlindBoxPoolItem,
  InventoryExecutionReadinessReport,
  InventoryOperation,
} from "../../types/blindBox";
import { describeInventoryReadiness } from "../../utils/inventoryReadiness";

export interface InventoryOperationTableRow {
  operation: InventoryOperation;
  assignment: BlindBoxAssignment | null;
  blindBoxName: string;
  poolItem: BlindBoxPoolItem | null;
}

export interface InventoryOperationsTableProps {
  rows: InventoryOperationTableRow[];
  readinessByOperationId: Record<string, InventoryExecutionReadinessReport>;
  readinessErrorsByOperationId: Record<string, string>;
  checkingReadinessOperationId: string | null;
  retryingOperationId: string | null;
  onCheckReadiness: (row: InventoryOperationTableRow) => void;
  onRetry: (row: InventoryOperationTableRow) => void;
}

function getOperationActionLabel(status: InventoryOperation["status"]): string | null {
  if (status === "failed") {
    return "Retry";
  }

  if (status === "pending") {
    return "Run Now";
  }

  return null;
}

function getOperationReason(row: InventoryOperationTableRow): string {
  if (row.operation.reason) {
    return row.operation.reason;
  }

  if (row.operation.status === "succeeded") {
    return "Inventory execution succeeded.";
  }

  if (row.operation.status === "processing") {
    return "Inventory execution is in progress or needs manual reconciliation.";
  }

  return "No inventory execution reason has been recorded yet.";
}

export function InventoryOperationsTable({
  rows,
  readinessByOperationId,
  readinessErrorsByOperationId,
  checkingReadinessOperationId,
  retryingOperationId,
  onCheckReadiness,
  onRetry,
}: InventoryOperationsTableProps) {
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.operation.id}
      emptyMessage="No inventory operations have been recorded yet."
      columns={[
        {
          key: "status",
          header: "Status",
          cell: (row) => (
            <div className="table-primary">
              <span>
                <StatusBadge value={row.operation.status} />
              </span>
              <span>
                <StatusBadge value={row.operation.operationType} />
              </span>
              {row.assignment ? (
                <span>
                  <StatusBadge value={row.assignment.status} />
                </span>
              ) : null}
            </div>
          ),
        },
        {
          key: "context",
          header: "Assignment / Order",
          cell: (row) => (
            <div className="table-primary">
              <strong>{row.assignment?.orderId || "Order not linked"}</strong>
              <span>Assignment {formatOptionalValue(row.operation.assignmentId)}</span>
              <span>Order line {formatOptionalValue(row.assignment?.orderLineId)}</span>
            </div>
          ),
        },
        {
          key: "item",
          header: "Blind Box / Reward",
          cell: (row) => (
            <div className="table-primary">
              <strong>{row.blindBoxName}</strong>
              <span>
                {row.poolItem?.label ||
                  row.operation.rewardTitleSnapshot ||
                  row.assignment?.selectedRewardTitleSnapshot ||
                  row.operation.rewardProductId ||
                  row.operation.poolItemId ||
                  "Reward target not linked"}
              </span>
              <span>
                Variant{" "}
                <code className="inline-code">
                  {row.poolItem?.sourceVariantId ||
                    row.operation.rewardVariantId ||
                    row.assignment?.selectedRewardVariantId ||
                    "Not set"}
                </code>
              </span>
            </div>
          ),
        },
        {
          key: "reason",
          header: "Reason / Readiness",
          cell: (row) => {
            const readiness = describeInventoryReadiness(
              readinessByOperationId[row.operation.id],
            );
            const readinessError = readinessErrorsByOperationId[row.operation.id];
            const isChecking = checkingReadinessOperationId === row.operation.id;

            return (
              <div className="table-primary">
                <strong>{getOperationReason(row)}</strong>
                <span>
                  Attempts {row.operation.attemptCount} | Last update{" "}
                  {formatDateTime(row.operation.updatedAt)}
                </span>
                {isChecking ? (
                  <span>Checking execute-mode readiness against the connected store.</span>
                ) : readinessError ? (
                  <span>{readinessError}</span>
                ) : readinessByOperationId[row.operation.id] ? (
                  <>
                    <span>
                      <StatusBadge value={readiness.badgeValue} />
                    </span>
                    <span>{readiness.summary}</span>
                    {readiness.fixRecommendation ? (
                      <span>{readiness.fixRecommendation}</span>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          },
        },
        {
          key: "actions",
          header: "Actions",
          className: "table-actions",
          cell: (row) => {
            const actionLabel = getOperationActionLabel(row.operation.status);
            const isRetrying = retryingOperationId === row.operation.id;
            const isChecking = checkingReadinessOperationId === row.operation.id;

            return (
              <div className="table-action-stack">
                <button
                  className="button button-secondary button-inline"
                  type="button"
                  onClick={() => onCheckReadiness(row)}
                  disabled={isChecking}
                >
                  {isChecking ? "Checking..." : "Check Readiness"}
                </button>
                {actionLabel ? (
                  <button
                    className="button button-primary button-inline"
                    type="button"
                    onClick={() => onRetry(row)}
                    disabled={isRetrying}
                  >
                    {isRetrying ? "Running..." : actionLabel}
                  </button>
                ) : (
                  <span className="table-inline-note">
                    {row.operation.status === "processing"
                      ? "Wait for reconciliation"
                      : "No retry needed"}
                  </span>
                )}
              </div>
            );
          },
        },
      ]}
    />
  );
}
