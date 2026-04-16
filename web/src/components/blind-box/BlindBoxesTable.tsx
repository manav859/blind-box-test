import { Link } from "react-router-dom";
import type { BlindBox } from "../../types/blindBox";
import { DataTable } from "../admin/DataTable";
import { StatusBadge } from "../admin/StatusBadge";
import { formatDateTime } from "../../utils/format";
import { useEmbeddedPath } from "../../hooks/useEmbeddedRouting";

export interface BlindBoxesTableProps {
  blindBoxes: BlindBox[];
}

export function BlindBoxesTable({ blindBoxes }: BlindBoxesTableProps) {
  const embeddedPath = useEmbeddedPath();

  return (
    <DataTable
      rows={blindBoxes}
      rowKey={(blindBox) => blindBox.id}
      emptyMessage="No blind boxes have been created yet."
      columns={[
        {
          key: "name",
          header: "Blind Box",
          cell: (blindBox) => (
            <div className="table-primary">
              <strong>{blindBox.name}</strong>
              <span>{blindBox.description || "No description"}</span>
            </div>
          ),
        },
        {
          key: "strategy",
          header: "Strategy",
          cell: (blindBox) => <StatusBadge value={blindBox.selectionStrategy} />,
        },
        {
          key: "status",
          header: "Status",
          cell: (blindBox) => <StatusBadge value={blindBox.status} />,
        },
        {
          key: "updatedAt",
          header: "Updated",
          cell: (blindBox) => formatDateTime(blindBox.updatedAt),
        },
        {
          key: "actions",
          header: "Actions",
          cell: (blindBox) => (
            <Link
              className="button button-secondary button-inline"
              to={embeddedPath(`/blind-box/pools/${blindBox.id}`)}
            >
              Edit
            </Link>
          ),
          className: "table-actions",
        },
      ]}
    />
  );
}
