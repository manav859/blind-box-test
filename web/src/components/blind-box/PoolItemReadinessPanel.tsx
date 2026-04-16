import { StatePanel } from "../admin/StatePanel";
import { StatusBadge } from "../admin/StatusBadge";
import type {
  BlindBoxPoolItem,
  InventoryExecutionReadinessReport,
} from "../../types/blindBox";
import { describeInventoryReadiness } from "../../utils/inventoryReadiness";
import { IdentifierValue } from "./IdentifierValue";

export interface PoolItemReadinessPanelProps {
  item?: BlindBoxPoolItem;
  report?: InventoryExecutionReadinessReport | null;
  error?: string | null;
  isLoading: boolean;
  onCheck: () => void;
}

export function PoolItemReadinessPanel({
  item,
  report,
  error,
  isLoading,
  onCheck,
}: PoolItemReadinessPanelProps) {
  if (!item?.id) {
    return (
      <StatePanel
        title="Select or save a pool item first"
        description="Choose an item from the table or save a new one before running connected-store execute-mode validation."
      />
    );
  }

  if (isLoading) {
    return (
      <StatePanel
        title="Validating execute-mode readiness"
        description={`Checking ${item.label} against the current SHOPLINE store, scopes, location, and inventory linkage.`}
      />
    );
  }

  if (error) {
    return (
      <StatePanel
        title="Readiness check failed"
        description={error}
        action={
          <button className="button button-secondary" type="button" onClick={onCheck}>
            Retry Readiness Check
          </button>
        }
      />
    );
  }

  if (!report) {
    return (
      <StatePanel
        title="No readiness result yet"
        description="Run the execute-mode readiness check after you save sourceProductId and sourceVariantId."
        action={
          <button className="button button-secondary" type="button" onClick={onCheck}>
            Run Readiness Check
          </button>
        }
      />
    );
  }

  const readiness = describeInventoryReadiness(report);

  return (
    <div className="pool-item-readiness-panel stack-lg">
      <div className="pool-item-readiness-top">
        <div className="stack-md">
          <span className="section-meta">Execute-mode validation</span>
          <div className="pool-item-readiness-top-row">
            <strong>{item.label}</strong>
            <div className="pool-item-readiness-badges">
              <StatusBadge value={readiness.badgeValue} />
              <StatusBadge value={report.runtimeExecutionMode} />
            </div>
          </div>
        </div>
        <button className="button button-secondary" type="button" onClick={onCheck}>
          Re-run Readiness Check
        </button>
      </div>

      <div className="pool-item-readiness-callout">
        <strong>{readiness.title}</strong>
        <p>{readiness.summary}</p>
        {readiness.fixRecommendation ? <p>{readiness.fixRecommendation}</p> : null}
      </div>

      <div className="readiness-grid">
        <div className="info-list-item pool-item-readiness-card">
          <strong>Assignment-time identifiers</strong>
          <div className="stack-md">
            <IdentifierValue
              label="Product"
              value={report.identifiers?.assignmentSourceProductId}
            />
            <IdentifierValue
              label="Variant"
              value={report.identifiers?.assignmentSourceVariantId}
            />
          </div>
        </div>

        <div className="info-list-item pool-item-readiness-card">
          <strong>Execution-time identifiers</strong>
          <div className="stack-md">
            <IdentifierValue
              label="Resolved variant"
              value={report.identifiers?.resolvedVariantId}
              emptyLabel="Not resolved"
            />
            <IdentifierValue
              label="Inventory item"
              value={report.identifiers?.inventoryItemId}
              emptyLabel="Not resolved"
            />
            <IdentifierValue
              label="Location"
              value={report.identifiers?.locationId || report.configuredLocationId}
              emptyLabel="Not resolved"
            />
            <div className="readiness-fact">
              <span className="readiness-fact-label">Resolution</span>
              <strong>{report.identifiers?.locationResolution || "Not resolved"}</strong>
            </div>
          </div>
        </div>

        <div className="info-list-item pool-item-readiness-card">
          <strong>Inventory state</strong>
          <div className="stack-md">
            <div className="readiness-fact">
              <span className="readiness-fact-label">Tracked</span>
              <strong>
                {report.inventoryItem
                  ? report.inventoryItem.tracked
                    ? "Yes"
                    : "No"
                  : "Unknown"}
              </strong>
            </div>
            <IdentifierValue label="SKU" value={report.inventoryItem?.sku} />
            <div className="readiness-fact">
              <span className="readiness-fact-label">Available at target location</span>
              <strong>{report.inventoryLevel?.available ?? "Not available"}</strong>
            </div>
          </div>
        </div>
      </div>

      {report.issues.length > 0 ? (
        <div className="stack-md">
          <strong>Operator actions</strong>
          {report.issues.map((issue) => (
            <div className="info-list-item pool-item-readiness-issue" key={issue.code}>
              <strong>{issue.message}</strong>
              <span>{issue.fixRecommendation}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
