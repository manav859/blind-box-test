import { AdminLayout } from "../../components/admin/AdminLayout";
import { PageHeader } from "../../components/admin/PageHeader";
import { SectionCard } from "../../components/admin/SectionCard";
import { StatePanel } from "../../components/admin/StatePanel";
import { BlindBoxesTable } from "../../components/blind-box/BlindBoxesTable";
import { useBlindBoxAdminApi } from "../../hooks/useBlindBoxAdminApi";
import { useResource } from "../../hooks/useResource";

export default function BlindBoxListPage() {
  const api = useBlindBoxAdminApi();
  const blindBoxes = useResource(() => api.listBlindBoxes(), [], {
    enabled: api.isReady,
  });

  return (
    <AdminLayout>
      <div className="admin-content-area stack-xl">
        <PageHeader
          eyebrow="Merchant Dashboard"
          title="Detected Blind Boxes"
          description='Tagged SHOPLINE products are discovered automatically. Use this page to review detected products, confirm tag-based reward resolution, and keep a legacy fallback link only when older products still need it.'
          actions={
            <button className="button button-primary" type="button" onClick={blindBoxes.reload}>
              Refresh Detection
            </button>
          }
        />

        <SectionCard
          title="All detected blind-box products"
          description='SHOPLINE owns the product catalog and the primary reward-collection tag. This app caches detected blind-box references, stores operational state, and keeps legacy fallback links for older setups.'
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
              title="No detected blind boxes yet"
              description='Add the "blind-box" tag to a SHOPLINE product, then refresh this page to hydrate its app cache record automatically.'
            />
          )}
        </SectionCard>
      </div>
    </AdminLayout>
  );
}
