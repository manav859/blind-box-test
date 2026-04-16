import { Link } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { PageHeader } from "../../components/admin/PageHeader";
import { SectionCard } from "../../components/admin/SectionCard";
import { StatePanel } from "../../components/admin/StatePanel";
import { BlindBoxesTable } from "../../components/blind-box/BlindBoxesTable";
import { useBlindBoxAdminApi } from "../../hooks/useBlindBoxAdminApi";
import { useEmbeddedPath } from "../../hooks/useEmbeddedRouting";
import { useResource } from "../../hooks/useResource";

export default function BlindBoxListPage() {
  const api = useBlindBoxAdminApi();
  const embeddedPath = useEmbeddedPath();
  const blindBoxes = useResource(() => api.listBlindBoxes(), [], {
    enabled: api.isReady,
  });

  return (
    <AdminLayout>
      <div className="admin-content-area stack-xl">
        <PageHeader
          eyebrow="Merchant Dashboard"
          title="Blind Boxes"
          description="Manage blind-box pools, review strategies, and jump into box-level configuration."
          actions={
            <Link className="button button-primary" to={embeddedPath("/blind-box/pools/new")}>
              Create Blind Box
            </Link>
          }
        />

        <SectionCard
          title="All blind boxes"
          description="Each blind box remains a backend-owned pool with frontend admin controls only."
          actions={
            blindBoxes.data ? (
              <span className="section-meta">
                {blindBoxes.data.length} total
                {blindBoxes.isRefreshing ? " • Refreshing..." : ""}
              </span>
            ) : null
          }
        >
          {blindBoxes.isLoading ? (
            <StatePanel
              title={api.isReady ? "Loading blind boxes" : "Preparing admin session"}
              description={
                api.initializationError?.message ||
                (api.isReady
                  ? "Fetching the current blind-box configuration from the admin API."
                  : "Waiting for the embedded SHOPLINE session token before loading blind-box data.")
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
          ) : blindBoxes.error ? (
            <StatePanel
              title="Unable to load blind boxes"
              description={blindBoxes.error.message}
              action={
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={blindBoxes.reload}
                >
                  Retry
                </button>
              }
            />
          ) : blindBoxes.data && blindBoxes.data.length > 0 ? (
            <BlindBoxesTable blindBoxes={blindBoxes.data} />
          ) : (
            <StatePanel
              title="No blind boxes yet"
              description="Create your first blind box to start configuring pool items and product mappings."
              action={
                <Link
                  className="button button-primary"
                  to={embeddedPath("/blind-box/pools/new")}
                >
                  Create Blind Box
                </Link>
              }
            />
          )}
        </SectionCard>
      </div>
    </AdminLayout>
  );
}
