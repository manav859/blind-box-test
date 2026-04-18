import type {
  BlindBox,
  BlindBoxAssignment,
  BlindBoxPoolItem,
} from "../../types/blindBox";
import { DataTable } from "../admin/DataTable";
import { StatusBadge } from "../admin/StatusBadge";
import { formatDateTime, formatOptionalValue } from "../../utils/format";

export interface AssignmentTableRow {
  assignment: BlindBoxAssignment;
  blindBox: BlindBox | null;
  poolItem: BlindBoxPoolItem | null;
}

export interface AssignmentsTableProps {
  rows: AssignmentTableRow[];
}

export function AssignmentsTable({ rows }: AssignmentsTableProps) {
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.assignment.id}
      emptyMessage="No assignments have been recorded yet."
      columns={[
        {
          key: "orderId",
          header: "Order",
          cell: (row) => (
            <div className="table-primary">
              <strong>{row.assignment.orderId}</strong>
              <span>Line {row.assignment.orderLineId}</span>
            </div>
          ),
        },
        {
          key: "blindBox",
          header: "Blind Box",
          cell: (row) => row.blindBox?.name || "Unknown blind box",
        },
        {
          key: "item",
          header: "Assigned Reward",
          cell: (row) =>
            row.poolItem?.label ||
            row.assignment.selectedRewardTitleSnapshot ||
            row.assignment.selectedRewardProductId ||
            formatOptionalValue(row.assignment.selectedPoolItemId),
        },
        {
          key: "status",
          header: "Status",
          cell: (row) => <StatusBadge value={row.assignment.status} />,
        },
        {
          key: "createdAt",
          header: "Created",
          cell: (row) => formatDateTime(row.assignment.createdAt),
        },
        {
          key: "updatedAt",
          header: "Updated",
          cell: (row) => formatDateTime(row.assignment.updatedAt),
        },
      ]}
    />
  );
}
