import { DataTable } from "../admin/DataTable";
import { StatusBadge } from "../admin/StatusBadge";
import { formatDateTime } from "../../utils/format";
import type { WebhookEvent } from "../../types/blindBox";

export interface WebhookEventsTableProps {
  events: WebhookEvent[];
}

export function WebhookEventsTable({ events }: WebhookEventsTableProps) {
  return (
    <DataTable
      rows={events}
      rowKey={(event) => event.id}
      emptyMessage="No webhook events matched the current filter."
      columns={[
        {
          key: "status",
          header: "Status",
          cell: (event) => <StatusBadge value={event.status} />,
        },
        {
          key: "topic",
          header: "Topic",
          cell: (event) => (
            <div className="table-primary">
              <strong>{event.topic}</strong>
              <span>{event.eventId}</span>
            </div>
          ),
        },
        {
          key: "error",
          header: "Failure Detail",
          cell: (event) => (
            <div className="table-primary">
              <strong>{event.errorMessage || "No webhook error message recorded."}</strong>
              <span>Updated {formatDateTime(event.updatedAt)}</span>
            </div>
          ),
        },
      ]}
    />
  );
}
