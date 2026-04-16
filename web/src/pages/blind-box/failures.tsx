import { useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { PageHeader } from "../../components/admin/PageHeader";
import { SectionCard } from "../../components/admin/SectionCard";
import { StatePanel } from "../../components/admin/StatePanel";
import {
  InventoryOperationsTable,
  type InventoryOperationTableRow,
} from "../../components/blind-box/InventoryOperationsTable";
import { WebhookEventsTable } from "../../components/blind-box/WebhookEventsTable";
import { useBlindBoxAdminApi } from "../../hooks/useBlindBoxAdminApi";
import { useResource } from "../../hooks/useResource";
import { useToast } from "../../hooks/useToast";
import type {
  BlindBoxAssignment,
  InventoryExecutionReadinessReport,
  InventoryOperation,
  WebhookEvent,
} from "../../types/blindBox";
import { loadBlindBoxCatalog } from "../../utils/blindBoxCatalog";

interface OperationsPageData {
  inventoryRows: InventoryOperationTableRow[];
  failedWebhookEvents: WebhookEvent[];
}

export default function FailureLogsPage() {
  const api = useBlindBoxAdminApi();
  const toast = useToast();
  const [checkingReadinessOperationId, setCheckingReadinessOperationId] = useState<string | null>(null);
  const [retryingOperationId, setRetryingOperationId] = useState<string | null>(null);
  const [operationReadinessById, setOperationReadinessById] = useState<
    Record<string, InventoryExecutionReadinessReport>
  >({});
  const [operationReadinessErrorsById, setOperationReadinessErrorsById] = useState<
    Record<string, string>
  >({});

  const operations = useResource<OperationsPageData>(
    async () => {
      const [catalog, assignments, inventoryOperations, failedWebhookEvents] =
        await Promise.all([
          loadBlindBoxCatalog(api),
          api.listAssignments(),
          api.listInventoryOperations(),
          api.listWebhookEvents({
            status: "failed",
            topic: "orders/paid",
          }),
        ]);

      const blindBoxById = catalog.blindBoxes.reduce<Record<string, (typeof catalog.blindBoxes)[number]>>(
        (accumulator, blindBox) => {
          accumulator[blindBox.id] = blindBox;
          return accumulator;
        },
        {},
      );

      const assignmentById = assignments.reduce<Record<string, BlindBoxAssignment>>(
        (accumulator, assignment) => {
          accumulator[assignment.id] = assignment;
          return accumulator;
        },
        {},
      );

      const inventoryRows: InventoryOperationTableRow[] = inventoryOperations
        .slice()
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((operation: InventoryOperation) => {
          const assignment = operation.assignmentId
            ? assignmentById[operation.assignmentId] || null
            : null;
          const blindBoxId = operation.blindBoxId || assignment?.blindBoxId || "";
          const poolItemId = operation.poolItemId || assignment?.selectedPoolItemId || "";

          return {
            operation,
            assignment,
            blindBoxName: blindBoxById[blindBoxId]?.name || "Unknown blind box",
            poolItem: poolItemId ? catalog.poolItemsById[poolItemId] || null : null,
          };
        });

      return {
        inventoryRows,
        failedWebhookEvents: failedWebhookEvents
          .slice()
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      };
    },
    [],
    {
      enabled: api.isReady,
    },
  );

  async function handleCheckReadiness(row: InventoryOperationTableRow) {
    setCheckingReadinessOperationId(row.operation.id);
    setOperationReadinessErrorsById((currentValue) => {
      const nextValue = { ...currentValue };
      delete nextValue[row.operation.id];
      return nextValue;
    });

    try {
      const report = await api.getInventoryOperationExecutionReadiness(row.operation.id);
      setOperationReadinessById((currentValue) => ({
        ...currentValue,
        [row.operation.id]: report,
      }));
    } catch (error) {
      setOperationReadinessErrorsById((currentValue) => ({
        ...currentValue,
        [row.operation.id]:
          error instanceof Error
            ? error.message
            : "Failed to validate inventory operation readiness.",
      }));
    } finally {
      setCheckingReadinessOperationId(null);
    }
  }

  async function handleRetry(row: InventoryOperationTableRow) {
    setRetryingOperationId(row.operation.id);

    try {
      const result = await api.retryInventoryOperation(row.operation.id);
      toast.success(result.message || `Inventory operation ${result.outcome}.`);
      setOperationReadinessById((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[row.operation.id];
        return nextValue;
      });
      setOperationReadinessErrorsById((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[row.operation.id];
        return nextValue;
      });
      operations.reload();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to retry the inventory operation.";
      toast.error(message);
    } finally {
      setRetryingOperationId(null);
    }
  }

  return (
    <AdminLayout>
      <div className="admin-content-area stack-xl">
        <PageHeader
          eyebrow="Operations"
          title="Operations & Recovery"
          description="Use this page to inspect inventory execution state, rerun execute-mode readiness checks, retry safe operations, and review failed paid-order webhook events."
        />

        <SectionCard
          title="Inventory operations"
          description="Inventory operations remain backend-owned. Pending and failed rows can be validated and retried here after store configuration issues are fixed."
          actions={
            operations.data ? (
              <span className="section-meta">
                {operations.data.inventoryRows.length} operations
                {operations.isRefreshing ? " | Refreshing..." : ""}
              </span>
            ) : null
          }
        >
          {operations.isLoading ? (
            <StatePanel
              title={api.isReady ? "Loading operations" : "Preparing admin session"}
              description={
                api.initializationError?.message ||
                (api.isReady
                  ? "Fetching inventory operations, assignments, and webhook recovery context."
                  : "Waiting for the embedded SHOPLINE session token before loading operations.")
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
          ) : operations.error ? (
            <StatePanel
              title="Unable to load operations"
              description={operations.error.message}
              action={
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={operations.reload}
                >
                  Retry
                </button>
              }
            />
          ) : operations.data ? (
            <InventoryOperationsTable
              rows={operations.data.inventoryRows}
              readinessByOperationId={operationReadinessById}
              readinessErrorsByOperationId={operationReadinessErrorsById}
              checkingReadinessOperationId={checkingReadinessOperationId}
              retryingOperationId={retryingOperationId}
              onCheckReadiness={(row) => {
                void handleCheckReadiness(row);
              }}
              onRetry={(row) => {
                void handleRetry(row);
              }}
            />
          ) : null}
        </SectionCard>

        <SectionCard
          title="Failed paid-order webhooks"
          description="Failed webhook events usually mean assignment or inventory processing did not complete cleanly. Fix the underlying inventory or configuration issue before replaying or resending webhooks."
          actions={
            operations.data ? (
              <span className="section-meta">
                {operations.data.failedWebhookEvents.length} failed events
              </span>
            ) : null
          }
        >
          {operations.isLoading ? (
            <StatePanel
              title="Loading webhook failures"
              description="Fetching failed paid-order webhook events for this shop."
            />
          ) : operations.error ? (
            <StatePanel
              title="Unable to load webhook failures"
              description={operations.error.message}
            />
          ) : operations.data && operations.data.failedWebhookEvents.length > 0 ? (
            <WebhookEventsTable events={operations.data.failedWebhookEvents} />
          ) : (
            <StatePanel
              title="No failed paid-order webhooks"
              description="Paid-order webhook processing is currently healthy for the connected store."
            />
          )}
        </SectionCard>
      </div>
    </AdminLayout>
  );
}
