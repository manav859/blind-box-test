import type { FailureLogEntry } from "../../types/blindBox";
import { DataTable } from "../admin/DataTable";
import { StatusBadge } from "../admin/StatusBadge";
import { formatDateTime } from "../../utils/format";

export interface FailureLogsTableProps {
  entries: FailureLogEntry[];
}

export function FailureLogsTable({ entries }: FailureLogsTableProps) {
  return (
    <DataTable
      rows={entries}
      rowKey={(entry) => entry.id}
      emptyMessage="No failed assignments or inventory operations were found."
      columns={[
        {
          key: "source",
          header: "Source",
          cell: (entry) => <StatusBadge value={entry.source} />,
        },
        {
          key: "orderId",
          header: "Order",
          cell: (entry) => entry.orderId,
        },
        {
          key: "blindBox",
          header: "Blind Box",
          cell: (entry) => entry.blindBoxName,
        },
        {
          key: "item",
          header: "Item",
          cell: (entry) => entry.poolItemLabel,
        },
        {
          key: "status",
          header: "Status",
          cell: (entry) => <StatusBadge value={entry.status} />,
        },
        {
          key: "reason",
          header: "Failure Reason",
          cell: (entry) => (
            <div className="table-primary">
              <strong>{entry.reason}</strong>
              <span>{formatDateTime(entry.updatedAt)}</span>
            </div>
          ),
        },
      ]}
    />
  );
}
