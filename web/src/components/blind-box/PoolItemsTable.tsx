import type {
  BlindBoxPoolItem,
  InventoryExecutionReadinessReport,
} from "../../types/blindBox";
import { PoolItemRow } from "./PoolItemRow";

export interface PoolItemsTableProps {
  items: BlindBoxPoolItem[];
  readinessByPoolItemId: Record<string, InventoryExecutionReadinessReport>;
  readinessErrorsByPoolItemId: Record<string, string>;
  checkingPoolItemId: string | null;
  onEdit: (item: BlindBoxPoolItem) => void;
  onCheckReadiness: (item: BlindBoxPoolItem) => void;
}

export function PoolItemsTable({
  items,
  readinessByPoolItemId,
  readinessErrorsByPoolItemId,
  checkingPoolItemId,
  onEdit,
  onCheckReadiness,
}: PoolItemsTableProps) {
  return (
    <div className="table-scroll">
      <table className="data-table pool-items-table">
        <colgroup>
          <col className="pool-items-table-col pool-items-table-col--item" />
          <col className="pool-items-table-col pool-items-table-col--identifiers" />
          <col className="pool-items-table-col pool-items-table-col--inventory" />
          <col className="pool-items-table-col pool-items-table-col--readiness" />
          <col className="pool-items-table-col pool-items-table-col--updated" />
          <col className="pool-items-table-col pool-items-table-col--actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Pool Item</th>
            <th>Source IDs</th>
            <th>Inventory</th>
            <th>Readiness</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="data-table-empty" colSpan={6}>
                No pool items have been added yet.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <PoolItemRow
                key={item.id}
                item={item}
                readinessReport={readinessByPoolItemId[item.id]}
                readinessError={readinessErrorsByPoolItemId[item.id] || null}
                isCheckingReadiness={checkingPoolItemId === item.id}
                onEdit={onEdit}
                onCheckReadiness={onCheckReadiness}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
