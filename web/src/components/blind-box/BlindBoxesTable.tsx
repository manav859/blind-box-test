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
      emptyMessage="No detected blind-box products are cached yet."
      columns={[
        {
          key: "name",
          header: "Detected Blind Box",
          cell: (blindBox) => (
            <div className="table-primary">
              <strong>{blindBox.name}</strong>
              <span>
                Product{" "}
                <code className="inline-code">
                  {blindBox.shoplineProductId || "Legacy configuration"}
                </code>
              </span>
              <span>{blindBox.productTitleSnapshot || blindBox.description || "No product title snapshot yet"}</span>
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
              Configure
            </Link>
          ),
          className: "table-actions",
        },
      ]}
    />
  );
}
