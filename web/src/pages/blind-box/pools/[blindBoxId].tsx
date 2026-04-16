import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { PageHeader } from "../../../components/admin/PageHeader";
import { SectionCard } from "../../../components/admin/SectionCard";
import { StatePanel } from "../../../components/admin/StatePanel";
import {
  BlindBoxForm,
  getBlindBoxFormValues,
} from "../../../components/blind-box/BlindBoxForm";
import { PoolItemForm } from "../../../components/blind-box/PoolItemForm";
import { PoolItemReadinessPanel } from "../../../components/blind-box/PoolItemReadinessPanel";
import { PoolItemsTable } from "../../../components/blind-box/PoolItemsTable";
import { ProductMappingForm } from "../../../components/blind-box/ProductMappingForm";
import { ProductMappingsTable } from "../../../components/blind-box/ProductMappingsTable";
import { useBlindBoxAdminApi } from "../../../hooks/useBlindBoxAdminApi";
import { useEmbeddedPath } from "../../../hooks/useEmbeddedRouting";
import { useResource } from "../../../hooks/useResource";
import { useToast } from "../../../hooks/useToast";
import { formatTokenLabel } from "../../../utils/format";
import type {
  BlindBox,
  InventoryExecutionReadinessReport,
  BlindBoxPoolItem,
  BlindBoxProductMapping,
  CreateBlindBoxInput,
  UpsertBlindBoxPoolItemInput,
  UpsertBlindBoxProductMappingInput,
} from "../../../types/blindBox";
import { StatusBadge } from "../../../components/admin/StatusBadge";

interface EditBlindBoxData {
  blindBox: BlindBox | null;
  poolItems: BlindBoxPoolItem[];
  productMappings: BlindBoxProductMapping[];
}

export default function EditBlindBoxPage() {
  const api = useBlindBoxAdminApi();
  const toast = useToast();
  const embeddedPath = useEmbeddedPath();
  const { blindBoxId = "" } = useParams();
  const [isSavingBlindBox, setIsSavingBlindBox] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [editingItem, setEditingItem] = useState<BlindBoxPoolItem | undefined>();
  const [editingMapping, setEditingMapping] = useState<
    BlindBoxProductMapping | undefined
  >();
  const [checkingPoolItemId, setCheckingPoolItemId] = useState<string | null>(null);
  const [poolItemReadinessById, setPoolItemReadinessById] = useState<
    Record<string, InventoryExecutionReadinessReport>
  >({});
  const [poolItemReadinessErrorsById, setPoolItemReadinessErrorsById] = useState<
    Record<string, string>
  >({});
  const [pageMessage, setPageMessage] = useState<string | null>(null);

  const blindBoxResource = useResource<EditBlindBoxData>(async () => {
    const [blindBoxes, poolItems, productMappings] = await Promise.all([
      api.listBlindBoxes(),
      api.listPoolItems(blindBoxId),
      api.listProductMappings(),
    ]);

    return {
      blindBox: blindBoxes.find((blindBox) => blindBox.id === blindBoxId) || null,
      poolItems,
      productMappings: productMappings.filter(
        (mapping) => mapping.blindBoxId === blindBoxId
      ),
    };
  }, [blindBoxId], {
    enabled: api.isReady,
  });
  const enabledMappings = blindBoxResource.data?.productMappings.filter(
    (mapping) => mapping.enabled
  ) || [];
  const variantScopedMappings = enabledMappings.filter((mapping) =>
    Boolean(mapping.productVariantId)
  );
  const merchantReadyPoolItems =
    blindBoxResource.data?.poolItems.filter(
      (item) => item.enabled && item.inventoryQuantity > 0
    ) || [];

  async function handleBlindBoxSubmit(values: CreateBlindBoxInput) {
    setIsSavingBlindBox(true);
    setPageMessage(null);

    try {
      await api.updateBlindBox(blindBoxId, values);
      toast.success("Blind box updated.");
      blindBoxResource.reload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update blind box.";
      setPageMessage(message);
      toast.error(message);
    } finally {
      setIsSavingBlindBox(false);
    }
  }

  async function handlePoolItemSubmit(values: UpsertBlindBoxPoolItemInput) {
    setIsSavingItem(true);
    setPageMessage(null);

    try {
      const savedItem = await api.upsertPoolItem(blindBoxId, values);
      toast.success(values.id ? "Pool item updated." : "Pool item added.");
      setEditingItem(savedItem);
      setPoolItemReadinessById((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[savedItem.id];
        return nextValue;
      });
      setPoolItemReadinessErrorsById((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[savedItem.id];
        return nextValue;
      });
      blindBoxResource.reload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save pool item.";
      setPageMessage(message);
      toast.error(message);
    } finally {
      setIsSavingItem(false);
    }
  }

  async function handleCheckPoolItemReadiness(item: BlindBoxPoolItem) {
    setEditingItem(item);
    setCheckingPoolItemId(item.id);
    setPoolItemReadinessErrorsById((currentValue) => {
      const nextValue = { ...currentValue };
      delete nextValue[item.id];
      return nextValue;
    });

    try {
      const report = await api.getPoolItemExecutionReadiness(item.id);
      setPoolItemReadinessById((currentValue) => ({
        ...currentValue,
        [item.id]: report,
      }));
    } catch (error) {
      setPoolItemReadinessErrorsById((currentValue) => ({
        ...currentValue,
        [item.id]:
          error instanceof Error
            ? error.message
            : "Failed to validate execute-mode readiness.",
      }));
    } finally {
      setCheckingPoolItemId(null);
    }
  }

  async function handleMappingSubmit(
    values: UpsertBlindBoxProductMappingInput
  ) {
    setIsSavingMapping(true);
    setPageMessage(null);

    try {
      await api.upsertProductMapping(values);
      toast.success(values.id ? "Product mapping updated." : "Product mapping added.");
      setEditingMapping(undefined);
      blindBoxResource.reload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save product mapping.";
      setPageMessage(message);
      toast.error(message);
    } finally {
      setIsSavingMapping(false);
    }
  }

  return (
    <AdminLayout>
      <div className="admin-content-area stack-xl">
        <PageHeader
          eyebrow="Edit"
          title="Blind Box Setup"
          description="Update merchant-managed configuration for the selected blind box."
          actions={
            <Link className="button button-secondary" to={embeddedPath("/blind-box/pools")}>
              Back To List
            </Link>
          }
        />

        {pageMessage ? (
          <div className="inline-banner inline-banner-error">{pageMessage}</div>
        ) : null}

        {blindBoxResource.isLoading ? (
          <SectionCard title="Loading blind box" description="Fetching pool, item, and mapping details.">
            <StatePanel
              title={api.isReady ? "Loading configuration" : "Preparing admin session"}
              description={
                api.initializationError?.message ||
                (api.isReady
                  ? "Pulling the latest blind-box state from the admin API."
                  : "Waiting for the embedded SHOPLINE session token before loading blind-box configuration.")
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
        ) : blindBoxResource.error ? (
          <SectionCard title="Unable to load blind box" description="The requested blind-box data could not be retrieved.">
            <StatePanel
              title="Request failed"
              description={blindBoxResource.error.message}
              action={
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={blindBoxResource.reload}
                >
                  Retry
                </button>
              }
            />
          </SectionCard>
        ) : !blindBoxResource.data?.blindBox ? (
          <SectionCard title="Blind box not found" description="The requested blind box does not exist for this shop.">
            <StatePanel
              title="Missing blind box"
              description="Return to the list and select an existing blind box."
              action={
                <Link
                  className="button button-secondary"
                  to={embeddedPath("/blind-box/pools")}
                >
                  Back To Blind Boxes
                </Link>
              }
            />
          </SectionCard>
        ) : (
          <>
            <SectionCard
              title="Commerce readiness"
              description="Review whether this blind box is actually connected to a sellable storefront product before activation and storefront QA."
            >
              <div className="readiness-grid">
                <div className="info-list-item">
                  <strong>Storefront blind-box mapping</strong>
                  <div className="pool-item-readiness-badges">
                    <StatusBadge
                      value={enabledMappings.length > 0 ? "ready" : "action_required"}
                    />
                    <span className="section-meta">
                      {enabledMappings.length} enabled mapping
                      {enabledMappings.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span>
                    Paid-order webhook detection uses the sold product id and optional sold
                    variant id from product mappings, not the prize-side
                    <code className="inline-code">sourceVariantId</code>.
                  </span>
                </div>

                <div className="info-list-item">
                  <strong>Variant mapping coverage</strong>
                  <div className="pool-item-readiness-badges">
                    <StatusBadge
                      value={
                        variantScopedMappings.length > 0 ? "enabled" : "needs_review"
                      }
                    />
                    <span className="section-meta">
                      {variantScopedMappings.length} variant-specific mapping
                      {variantScopedMappings.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span>
                    Variant-specific sold mappings are strongly recommended and become
                    mandatory when the storefront blind-box product has multiple sellable
                    variants.
                  </span>
                </div>

                <div className="info-list-item">
                  <strong>Prize pool coverage</strong>
                  <div className="pool-item-readiness-badges">
                    <StatusBadge
                      value={
                        merchantReadyPoolItems.length > 0 ? "ready" : "action_required"
                      }
                    />
                    <span className="section-meta">
                      {merchantReadyPoolItems.length} enabled in-stock pool item
                      {merchantReadyPoolItems.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span>
                    Activation still runs server-side validation. At least one enabled sold
                    mapping and one ready pool item must exist before the blind box can move
                    to <code className="inline-code">active</code>.
                  </span>
                </div>
              </div>
            </SectionCard>

            <div className="status-row">
              <StatusBadge value={blindBoxResource.data.blindBox.status} />
              <StatusBadge value={blindBoxResource.data.blindBox.selectionStrategy} />
              <span className="section-meta">
                {blindBoxResource.isRefreshing ? "Refreshing..." : "Configuration loaded"}
              </span>
            </div>

            <SectionCard
              title={blindBoxResource.data.blindBox.name}
              description={
                blindBoxResource.data.blindBox.description ||
                "No internal description has been added for this blind box."
              }
            >
              <BlindBoxForm
                key={blindBoxResource.data.blindBox.id}
                initialValues={getBlindBoxFormValues(blindBoxResource.data.blindBox)}
                submitLabel="Update Blind Box"
                isSubmitting={isSavingBlindBox}
                onSubmit={handleBlindBoxSubmit}
              />
            </SectionCard>

            <div className="dashboard-grid pool-items-workspace">
              <SectionCard
                title="Pool items"
                description="Manage prize candidates, scan source ids clearly, and trigger execute-mode checks without leaving the setup screen."
              >
                <PoolItemsTable
                  items={blindBoxResource.data.poolItems}
                  readinessByPoolItemId={poolItemReadinessById}
                  readinessErrorsByPoolItemId={poolItemReadinessErrorsById}
                  checkingPoolItemId={checkingPoolItemId}
                  onEdit={(item) => setEditingItem(item)}
                  onCheckReadiness={handleCheckPoolItemReadiness}
                />
              </SectionCard>

              <SectionCard
                title={editingItem ? "Edit pool item" : "Add pool item"}
                description={
                  editingItem
                    ? `Updating ${editingItem.label}. Save here, then use the readiness section below for the full connected-store validation result.`
                    : `The current strategy is ${formatTokenLabel(
                        blindBoxResource.data.blindBox.selectionStrategy
                      )}. New items can be added here, then validated against the connected store.`
                }
              >
                <div className="pool-item-editor stack-xl">
                  <div className="pool-item-editor-intro">
                    <div className="info-list-item">
                      <strong>Operator workflow</strong>
                      <span>
                        1. Inspect the live product and variant on the Debug page.
                      </span>
                      <span>
                        2. Paste <code className="inline-code">sourceProductId</code> and{" "}
                        <code className="inline-code">sourceVariantId</code> here.
                      </span>
                      <span>
                        3. Save the pool item and run the readiness check to confirm
                        execute-mode eligibility.
                      </span>
                    </div>
                  </div>

                  <PoolItemForm
                    key={editingItem?.id || "new-pool-item"}
                    blindBoxId={blindBoxId}
                    initialValues={editingItem}
                    isSubmitting={isSavingItem}
                    onSubmit={handlePoolItemSubmit}
                    onCancel={
                      editingItem ? () => setEditingItem(undefined) : undefined
                    }
                  />

                  <PoolItemReadinessPanel
                    item={editingItem}
                    report={
                      editingItem ? poolItemReadinessById[editingItem.id] : null
                    }
                    error={
                      editingItem
                        ? poolItemReadinessErrorsById[editingItem.id] || null
                        : null
                    }
                    isLoading={Boolean(editingItem && checkingPoolItemId === editingItem.id)}
                    onCheck={() => {
                      if (editingItem) {
                        void handleCheckPoolItemReadiness(editingItem);
                      }
                    }}
                  />
                </div>
              </SectionCard>
            </div>

            <div className="dashboard-grid dashboard-grid--split">
              <SectionCard
                title="Product mappings"
                description="Map the sellable SHOPLINE product or variant customers buy as the blind box. The paid-order webhook uses these identifiers to recognize blind-box order lines."
              >
                <ProductMappingsTable
                  mappings={blindBoxResource.data.productMappings}
                  onEdit={(mapping) => setEditingMapping(mapping)}
                />
              </SectionCard>

              <SectionCard
                title={editingMapping ? "Edit mapping" : "Add mapping"}
                description="Use the sold storefront product or variant here. Prize-side execution identifiers stay on pool items."
              >
                <ProductMappingForm
                  key={editingMapping?.id || "new-product-mapping"}
                  blindBoxId={blindBoxId}
                  initialValues={editingMapping}
                  isSubmitting={isSavingMapping}
                  onSubmit={handleMappingSubmit}
                  onCancel={
                    editingMapping ? () => setEditingMapping(undefined) : undefined
                  }
                />
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
