import type { BlindBoxProductMapping } from "../../types/blindBox";
import { DataTable } from "../admin/DataTable";
import { StatusBadge } from "../admin/StatusBadge";
import { formatDateTime, formatOptionalValue } from "../../utils/format";

export interface ProductMappingsTableProps {
  mappings: BlindBoxProductMapping[];
  onEdit: (mapping: BlindBoxProductMapping) => void;
}

export function ProductMappingsTable({
  mappings,
  onEdit,
}: ProductMappingsTableProps) {
  return (
    <DataTable
      rows={mappings}
      rowKey={(mapping) => mapping.id}
      emptyMessage="No product mappings exist for this blind box."
      columns={[
        {
          key: "productId",
          header: "Sold Blind-Box Product",
          cell: (mapping) => (
            <div className="table-primary">
              <strong>{mapping.productId}</strong>
              <span>
                Variant: {formatOptionalValue(mapping.productVariantId)}
              </span>
            </div>
          ),
        },
        {
          key: "status",
          header: "Status",
          cell: (mapping) => (
            <StatusBadge value={mapping.enabled ? "enabled" : "disabled"} />
          ),
        },
        {
          key: "updatedAt",
          header: "Updated",
          cell: (mapping) => formatDateTime(mapping.updatedAt),
        },
        {
          key: "actions",
          header: "Actions",
          cell: (mapping) => (
            <button
              className="button button-secondary button-inline"
              type="button"
              onClick={() => onEdit(mapping)}
            >
              Edit
            </button>
          ),
          className: "table-actions",
        },
      ]}
    />
  );
}
