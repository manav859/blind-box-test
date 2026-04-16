import type {
  BlindBoxPoolItem,
  InventoryExecutionReadinessReport,
} from "../../types/blindBox";
import { formatDateTime } from "../../utils/format";
import { StatusBadge } from "../admin/StatusBadge";
import { describeInventoryReadiness } from "../../utils/inventoryReadiness";
import { IdentifierValue } from "./IdentifierValue";

export interface PoolItemRowProps {
  item: BlindBoxPoolItem;
  readinessReport?: InventoryExecutionReadinessReport | null;
  readinessError?: string | null;
  isCheckingReadiness: boolean;
  onEdit: (item: BlindBoxPoolItem) => void;
  onCheckReadiness: (item: BlindBoxPoolItem) => void;
}

export function PoolItemRow({
  item,
  readinessReport,
  readinessError,
  isCheckingReadiness,
  onEdit,
  onCheckReadiness,
}: PoolItemRowProps) {
  const readiness = describeInventoryReadiness(readinessReport);
  const readinessDetail = readinessError
    ? readinessError
    : isCheckingReadiness
      ? "Running execute-mode validation against the connected SHOPLINE store."
      : readiness.summary;

  return (
    <tr>
      <td className="pool-items-cell pool-items-cell--item">
        <div className="table-primary pool-item-summary">
          <strong>{item.label}</strong>
          <div className="pool-item-meta-row">
            <StatusBadge value={item.enabled ? "enabled" : "disabled"} />
            <span>Weight {item.weight}</span>
          </div>
        </div>
      </td>
      <td className="pool-items-cell pool-items-cell--identifiers">
        <div className="pool-item-identifier-grid">
          <IdentifierValue label="Product" value={item.sourceProductId} />
          <IdentifierValue label="Variant" value={item.sourceVariantId} />
        </div>
      </td>
      <td className="pool-items-cell pool-items-cell--inventory">
        <div className="pool-item-inventory-block">
          <strong>{item.inventoryQuantity}</strong>
          <span>Eligibility quantity</span>
        </div>
      </td>
      <td className="pool-items-cell pool-items-cell--readiness">
        <div className="pool-item-readiness-summary">
          <div className="pool-item-readiness-header">
            <StatusBadge value={readiness.badgeValue} />
            <strong>
              {isCheckingReadiness ? "Checking connected store..." : readiness.title}
            </strong>
          </div>
          <span className="pool-item-readiness-text">{readinessDetail}</span>
          {!isCheckingReadiness && !readinessError && readiness.fixRecommendation ? (
            <span className="pool-item-readiness-note">
              See the side panel for next action details.
            </span>
          ) : null}
        </div>
      </td>
      <td className="pool-items-cell pool-items-cell--updated">
        <div className="table-primary">
          <strong>{formatDateTime(item.updatedAt)}</strong>
          <span>Last saved</span>
        </div>
      </td>
      <td className="table-actions">
        <div className="table-action-stack">
          <button
            className="button button-secondary button-inline"
            type="button"
            onClick={() => onCheckReadiness(item)}
            disabled={isCheckingReadiness}
          >
            {isCheckingReadiness ? "Checking..." : "Check Readiness"}
          </button>
          <button
            className="button button-secondary button-inline"
            type="button"
            onClick={() => onEdit(item)}
          >
            Edit
          </button>
        </div>
      </td>
    </tr>
  );
}
