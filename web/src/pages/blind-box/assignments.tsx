import { AdminLayout } from "../../components/admin/AdminLayout";
import { PageHeader } from "../../components/admin/PageHeader";
import { SectionCard } from "../../components/admin/SectionCard";
import { StatePanel } from "../../components/admin/StatePanel";
import {
  AssignmentsTable,
  type AssignmentTableRow,
} from "../../components/blind-box/AssignmentsTable";
import { useBlindBoxAdminApi } from "../../hooks/useBlindBoxAdminApi";
import { useResource } from "../../hooks/useResource";
import { loadBlindBoxCatalog } from "../../utils/blindBoxCatalog";

export default function AssignmentHistoryPage() {
  const api = useBlindBoxAdminApi();
  const assignments = useResource(async () => {
    const [catalog, assignmentRecords] = await Promise.all([
      loadBlindBoxCatalog(api),
      api.listAssignments(),
    ]);

    const blindBoxById = catalog.blindBoxes.reduce<Record<string, (typeof catalog.blindBoxes)[number]>>(
      (accumulator, blindBox) => {
        accumulator[blindBox.id] = blindBox;
        return accumulator;
      },
      {}
    );

    const rows: AssignmentTableRow[] = assignmentRecords.map((assignment) => ({
      assignment,
      blindBox: blindBoxById[assignment.blindBoxId] || null,
      poolItem: assignment.selectedPoolItemId
        ? catalog.poolItemsById[assignment.selectedPoolItemId] || null
        : null,
    }));

    return rows;
  }, [], {
    enabled: api.isReady,
  });

  return (
    <AdminLayout>
      <div className="admin-content-area stack-xl">
        <PageHeader
          eyebrow="Operations"
          title="Assignment History"
          description="Read-only visibility into backend-created blind-box assignments for paid order lines."
        />

        <SectionCard
          title="Assignments"
          description="Assignments are immutable once created by the backend workflow."
          actions={
            assignments.data ? (
              <span className="section-meta">
                {assignments.data.length} records
                {assignments.isRefreshing ? " • Refreshing..." : ""}
              </span>
            ) : null
          }
        >
          {assignments.isLoading ? (
            <StatePanel
              title={api.isReady ? "Loading assignments" : "Preparing admin session"}
              description={
                api.initializationError?.message ||
                (api.isReady
                  ? "Fetching assignment history and related blind-box metadata."
                  : "Waiting for the embedded SHOPLINE session token before loading assignment history.")
              }
              action={
                api.initializationError ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={api.retryInitialization}
                  >
                    Retry Session
                  </button>
                ) : null
              }
            />
          ) : assignments.error ? (
            <StatePanel
              title="Unable to load assignments"
              description={assignments.error.message}
              action={
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={assignments.reload}
                >
                  Retry
                </button>
              }
            />
          ) : assignments.data && assignments.data.length > 0 ? (
            <AssignmentsTable rows={assignments.data} />
          ) : (
            <StatePanel
              title="No assignments yet"
              description="Assignments appear here after a mapped blind-box product receives a paid order."
            />
          )}
        </SectionCard>
      </div>
    </AdminLayout>
  );
}
