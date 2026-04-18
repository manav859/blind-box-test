import { useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { PageHeader } from "../../components/admin/PageHeader";
import { SectionCard } from "../../components/admin/SectionCard";
import { StatePanel } from "../../components/admin/StatePanel";
import { useBlindBoxAdminApi } from "../../hooks/useBlindBoxAdminApi";
import type {
  BlindBox,
  BlindBoxProductMapping,
  InventoryDebugLocation,
  InventoryDebugProduct,
  InventoryDebugVariantInventory,
} from "../../types/blindBox";

interface DebugRequestState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

function createInitialState<T>(): DebugRequestState<T> {
  return {
    data: null,
    error: null,
    isLoading: false,
  };
}

interface StorefrontMappingSummary {
  blindBox: BlindBox;
  enabledMappings: BlindBoxProductMapping[];
  variantScopedMappings: BlindBoxProductMapping[];
}

function formatDebugJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

interface DebugJsonPanelProps<T> {
  idleTitle: string;
  idleDescription: string;
  loadingTitle: string;
  loadingDescription: string;
  state: DebugRequestState<T>;
  onRetry: () => void;
}

function DebugJsonPanel<T>({
  idleTitle,
  idleDescription,
  loadingTitle,
  loadingDescription,
  state,
  onRetry,
}: DebugJsonPanelProps<T>) {
  if (state.isLoading) {
    return <StatePanel title={loadingTitle} description={loadingDescription} />;
  }

  if (state.error) {
    return (
      <StatePanel
        title="Request failed"
        description={state.error}
        action={
          <button className="button button-secondary" type="button" onClick={onRetry}>
            Retry
          </button>
        }
      />
    );
  }

  if (!state.data) {
    return <StatePanel title={idleTitle} description={idleDescription} />;
  }

  return (
    <div className="debug-json-panel">
      <div className="debug-json-toolbar">
        <span className="section-meta">Authenticated response payload</span>
        <button className="button button-secondary button-inline" type="button" onClick={onRetry}>
          Reload
        </button>
      </div>
      <pre className="debug-json-output">{formatDebugJson(state.data)}</pre>
    </div>
  );
}

export default function BlindBoxDebugPage() {
  const api = useBlindBoxAdminApi();
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [storefrontMappingsState, setStorefrontMappingsState] = useState<
    DebugRequestState<StorefrontMappingSummary[]>
  >(createInitialState());
  const [locationsState, setLocationsState] = useState<DebugRequestState<InventoryDebugLocation[]>>(
    createInitialState(),
  );
  const [productState, setProductState] = useState<DebugRequestState<InventoryDebugProduct>>(
    createInitialState(),
  );
  const [variantInventoryState, setVariantInventoryState] = useState<
    DebugRequestState<InventoryDebugVariantInventory>
  >(createInitialState());

  async function loadStorefrontMappings() {
    setStorefrontMappingsState({
      data: null,
      error: null,
      isLoading: true,
    });

    try {
      const [blindBoxes, productMappings] = await Promise.all([
        api.listBlindBoxes(),
        api.listProductMappings(),
      ]);
      const data = blindBoxes.map((blindBox) => {
        const enabledMappings = productMappings.filter(
          (mapping) => mapping.blindBoxId === blindBox.id && mapping.enabled
        );

        return {
          blindBox,
          enabledMappings,
          variantScopedMappings: enabledMappings.filter((mapping) =>
            Boolean(mapping.productVariantId)
          ),
        };
      });

      setStorefrontMappingsState({
        data,
        error: null,
        isLoading: false,
      });
    } catch (error) {
      setStorefrontMappingsState({
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load storefront mapping overview.",
        isLoading: false,
      });
    }
  }

  async function loadLocations() {
    setLocationsState({
      data: null,
      error: null,
      isLoading: true,
    });

    try {
      const data = await api.listDebugLocations();
      setLocationsState({
        data,
        error: null,
        isLoading: false,
      });
    } catch (error) {
      setLocationsState({
        data: null,
        error: error instanceof Error ? error.message : "Unable to load locations.",
        isLoading: false,
      });
    }
  }

  async function loadProduct() {
    const normalizedProductId = productId.trim();
    if (!normalizedProductId) {
      setProductState({
        data: null,
        error: "Enter a SHOPLINE product id before loading product details.",
        isLoading: false,
      });
      return;
    }

    setProductState({
      data: null,
      error: null,
      isLoading: true,
    });

    try {
      const data = await api.getDebugProduct(normalizedProductId);
      setProductState({
        data,
        error: null,
        isLoading: false,
      });
    } catch (error) {
      setProductState({
        data: null,
        error: error instanceof Error ? error.message : "Unable to load product details.",
        isLoading: false,
      });
    }
  }

  async function loadVariantInventory() {
    const normalizedVariantId = variantId.trim();
    if (!normalizedVariantId) {
      setVariantInventoryState({
        data: null,
        error: "Enter a SHOPLINE variant id before loading variant inventory details.",
        isLoading: false,
      });
      return;
    }

    setVariantInventoryState({
      data: null,
      error: null,
      isLoading: true,
    });

    try {
      const data = await api.getDebugVariantInventory(normalizedVariantId);
      setVariantInventoryState({
        data,
        error: null,
        isLoading: false,
      });
    } catch (error) {
      setVariantInventoryState({
        data: null,
        error: error instanceof Error ? error.message : "Unable to load variant inventory details.",
        isLoading: false,
      });
    }
  }

  return (
    <AdminLayout>
      <div className="admin-content-area stack-xl">
        <PageHeader
          eyebrow="Live Store Validation"
          title="Debug Console"
          description="Run authenticated store diagnostics through the embedded app session so you can validate locations, source products, and inventory-backed variants without browser fetch redirects."
        />

        {!api.isReady ? (
          <SectionCard
            title="Preparing admin session"
            description="The debug tools wait for the embedded SHOPLINE session token before issuing protected requests."
          >
            <StatePanel
              title="Waiting for session readiness"
              description={
                api.initializationError?.message ||
                "Holding debug requests until the embedded admin session is ready."
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
          </SectionCard>
        ) : null}

        <SectionCard
          title="How To Use This Page"
          description="Use the embedded admin session to inspect live store identifiers before execute-mode testing."
        >
          <div className="stack-md">
            <div className="info-list-item">
              <strong>1. Load locations</strong>
              <span>Pick the real active location id that execute mode should target.</span>
            </div>
            <div className="info-list-item">
              <strong>2. Inspect a product</strong>
              <span>Find the exact variant id and inventory item linkage for the prize product.</span>
            </div>
            <div className="info-list-item">
              <strong>3. Inspect variant inventory</strong>
              <span>Confirm the variant is tracked and linked to the configured execute-mode location.</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Detection & Legacy Mapping Overview"
          description="Confirm which blind boxes are being auto-detected from SHOPLINE products and which still rely on deprecated legacy sold-product mappings."
          actions={
            <button
              className="button button-primary"
              type="button"
              onClick={loadStorefrontMappings}
              disabled={storefrontMappingsState.isLoading || !api.isReady}
            >
              {!api.isReady
                ? "Preparing..."
                : storefrontMappingsState.isLoading
                  ? "Loading..."
                  : "Load Mapping Overview"}
            </button>
          }
        >
          {storefrontMappingsState.isLoading ? (
            <StatePanel
              title="Loading detection overview"
              description="Fetching detected blind boxes and any remaining enabled legacy sold-product mappings from the authenticated admin API."
            />
          ) : storefrontMappingsState.error ? (
            <StatePanel
              title="Unable to load mapping overview"
              description={storefrontMappingsState.error}
              action={
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={loadStorefrontMappings}
                >
                  Retry
                </button>
              }
            />
          ) : storefrontMappingsState.data ? (
            storefrontMappingsState.data.length > 0 ? (
              <div className="stack-md">
                {storefrontMappingsState.data.map((entry) => (
                  <div className="info-list-item" key={entry.blindBox.id}>
                    <div className="pool-item-readiness-top-row">
                      <strong>{entry.blindBox.name}</strong>
                      <div className="pool-item-readiness-badges">
                        <StatusBadge value={entry.blindBox.status} />
                        <StatusBadge
                          value={
                            entry.enabledMappings.length > 0
                              ? "ready"
                              : "action_required"
                          }
                        />
                      </div>
                    </div>
                    <span>
                      Enabled legacy sold mappings: {entry.enabledMappings.length}. Variant-specific
                      legacy mappings: {entry.variantScopedMappings.length}.
                    </span>
                    <span>
                      Tagged SHOPLINE products are now detected automatically. Any enabled product mappings shown here are compatibility-only fallback paths.
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <StatePanel
                title="No blind boxes found"
                description='Tag a SHOPLINE product with "blind-box" and reload the detected blind-box list before running storefront diagnostics.'
              />
            )
          ) : (
            <StatePanel
              title="No detection overview loaded yet"
              description="Load the overview to confirm whether each blind box is being auto-detected and whether any deprecated legacy mappings still remain before QA."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Locations"
          description="List the active store locations visible to the current private-app installation."
          actions={
            <button
              className="button button-primary"
              type="button"
              onClick={loadLocations}
              disabled={locationsState.isLoading || !api.isReady}
            >
              {!api.isReady
                ? "Preparing..."
                : locationsState.isLoading
                  ? "Loading..."
                  : "Load Locations"}
            </button>
          }
        >
          <DebugJsonPanel
            idleTitle="No locations loaded yet"
            idleDescription="Click Load Locations to inspect active store locations through the embedded authenticated fetch flow."
            loadingTitle="Loading locations"
            loadingDescription="Fetching the connected store locations with the current admin session token."
            state={locationsState}
            onRetry={loadLocations}
          />
        </SectionCard>

        <SectionCard
          title="Product Inspection"
          description="Load a real SHOPLINE product and inspect its variants before choosing a sourceVariantId for a pool item."
          actions={
            <button
              className="button button-primary"
              type="button"
              onClick={loadProduct}
              disabled={productState.isLoading || !api.isReady}
            >
              {!api.isReady
                ? "Preparing..."
                : productState.isLoading
                  ? "Loading..."
                  : "Load Product"}
            </button>
          }
        >
          <div className="debug-input-row">
            <div className="form-field debug-input-field">
              <label className="form-label" htmlFor="debug-product-id">
                Product Id
              </label>
              <input
                id="debug-product-id"
                className="text-input"
                type="text"
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                placeholder="Enter a real SHOPLINE product id"
              />
              <span className="form-hint">
                Use the store product id you want to inspect. GIDs also work.
              </span>
            </div>
          </div>

          <DebugJsonPanel
            idleTitle="No product loaded yet"
            idleDescription="Enter a product id and load it through the embedded admin session."
            loadingTitle="Loading product"
            loadingDescription="Fetching the product and its variant inventory fields from the admin API."
            state={productState}
            onRetry={loadProduct}
          />
        </SectionCard>

        <SectionCard
          title="Variant Inventory Inspection"
          description="Validate whether a specific variant is actually executable in the connected store and target location."
          actions={
            <button
              className="button button-primary"
              type="button"
              onClick={loadVariantInventory}
              disabled={variantInventoryState.isLoading || !api.isReady}
            >
              {!api.isReady
                ? "Preparing..."
                : variantInventoryState.isLoading
                  ? "Loading..."
                  : "Load Variant Inventory"}
            </button>
          }
        >
          <div className="debug-input-row">
            <div className="form-field debug-input-field">
              <label className="form-label" htmlFor="debug-variant-id">
                Variant Id
              </label>
              <input
                id="debug-variant-id"
                className="text-input"
                type="text"
                value={variantId}
                onChange={(event) => setVariantId(event.target.value)}
                placeholder="Enter a real SHOPLINE variant id"
              />
              <span className="form-hint">
                Use the exact variant you plan to assign as the pool item sourceVariantId.
              </span>
            </div>
          </div>

          <DebugJsonPanel
            idleTitle="No variant inventory loaded yet"
            idleDescription="Enter a variant id and inspect its inventory item, location linkage, and validation issues."
            loadingTitle="Loading variant inventory"
            loadingDescription="Fetching variant inventory state from the connected store using the embedded authenticated fetch flow."
            state={variantInventoryState}
            onRetry={loadVariantInventory}
          />
        </SectionCard>
      </div>
    </AdminLayout>
  );
}
