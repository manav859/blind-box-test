import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { PageHeader } from "../../../components/admin/PageHeader";
import { SectionCard } from "../../../components/admin/SectionCard";
import { StatePanel } from "../../../components/admin/StatePanel";
import {
  BlindBoxForm,
  getBlindBoxFormValues,
} from "../../../components/blind-box/BlindBoxForm";
import { RewardGroupForm } from "../../../components/blind-box/RewardGroupForm";
import { useBlindBoxAdminApi } from "../../../hooks/useBlindBoxAdminApi";
import { useEmbeddedPath } from "../../../hooks/useEmbeddedRouting";
import { useResource } from "../../../hooks/useResource";
import { useToast } from "../../../hooks/useToast";
import type {
  BlindBox,
  BlindBoxActivationReadinessReport,
  BlindBoxAssignment,
  InventoryOperation,
  RewardGroup,
  CreateBlindBoxInput,
  UpsertRewardGroupInput,
} from "../../../types/blindBox";
import { StatusBadge } from "../../../components/admin/StatusBadge";
import { formatDateTime, formatOptionalValue } from "../../../utils/format";

interface EditBlindBoxData {
  blindBox: BlindBox | null;
  rewardGroups: RewardGroup[];
  linkedRewardGroup: RewardGroup | null;
  readiness: BlindBoxActivationReadinessReport | null;
  readinessError: string | null;
  recentAssignments: BlindBoxAssignment[];
  recentOperations: InventoryOperation[];
}

export default function EditBlindBoxPage() {
  const api = useBlindBoxAdminApi();
  const toast = useToast();
  const embeddedPath = useEmbeddedPath();
  const { blindBoxId = "" } = useParams();
  const [isSavingBlindBox, setIsSavingBlindBox] = useState(false);
  const [isSavingRewardGroup, setIsSavingRewardGroup] = useState(false);
  const [pageMessage, setPageMessage] = useState<string | null>(null);

  const blindBoxResource = useResource<EditBlindBoxData>(
    async () => {
      const [blindBoxes, rewardGroups, rewardGroupLinks, assignments, inventoryOperations] = await Promise.all([
        api.listBlindBoxes(),
        api.listRewardGroups(),
        api.listRewardGroupLinks(),
        api.listAssignments(),
        api.listInventoryOperations(),
      ]);

      const blindBox = blindBoxes.find((item) => item.id === blindBoxId) || null;
      const linkedRewardGroupId = rewardGroupLinks.find(
        (link) => link.blindBoxId === blindBoxId
      )?.rewardGroupId;
      const linkedRewardGroup =
        rewardGroups.find((group) => group.id === linkedRewardGroupId) || null;

      let readiness: BlindBoxActivationReadinessReport | null = null;
      let readinessError: string | null = null;
      if (blindBox) {
        try {
          readiness = await api.getBlindBoxReadiness(blindBox.id);
        } catch (error) {
          readiness = null;
          readinessError =
            error instanceof Error ? error.message : "Unable to load the latest readiness report.";
        }
      }

      return {
        blindBox,
        rewardGroups,
        linkedRewardGroup,
        readiness,
        readinessError,
        recentAssignments: assignments
          .filter((assignment) => assignment.blindBoxId === blindBoxId)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 5),
        recentOperations: inventoryOperations
          .filter((operation) => operation.blindBoxId === blindBoxId)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 5),
      };
    },
    [blindBoxId],
    {
      enabled: api.isReady,
    }
  );

  const readiness = blindBoxResource.data?.readiness || null;
  const readinessBadge =
    readiness?.status === "ready" ? "ready" : readiness ? "action_required" : "needs_review";
  const eligibleCandidates = readiness?.eligibleCandidates || [];
  const excludedCandidates = readiness?.excludedCandidates || [];
  const readinessError = blindBoxResource.data?.readinessError || null;
  const linkedRewardGroup = blindBoxResource.data?.linkedRewardGroup || null;
  const resolvedCollection = readiness?.collection || null;
  const collectionResolutionSource = readiness?.resolutionSource || null;

  const collectionResolutionHint = useMemo(() => {
    if (resolvedCollection && collectionResolutionSource === "product_tag") {
      const handle = resolvedCollection.handle || "unknown-handle";
      return `Auto-resolved from SHOPLINE tag blind-box-collection:${handle}. No admin link is required.`;
    }

    if (resolvedCollection && collectionResolutionSource === "reward_group_link") {
      return `Resolved through the legacy fallback mapping for collection ${resolvedCollection.id}.`;
    }

    if (linkedRewardGroup) {
      return `Legacy fallback is linked to collection ${linkedRewardGroup.shoplineCollectionId}.`;
    }

    return "No reward collection is resolved yet. Add a blind-box-collection:<handle> tag in SHOPLINE, or use the legacy fallback below if needed.";
  }, [collectionResolutionSource, linkedRewardGroup, resolvedCollection]);

  async function handleBlindBoxSubmit(values: CreateBlindBoxInput) {
    setIsSavingBlindBox(true);
    setPageMessage(null);

    try {
      await api.updateBlindBox(blindBoxId, values);
      toast.success("Blind-box product reference updated.");
      blindBoxResource.reload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update blind-box product reference.";
      setPageMessage(message);
      toast.error(message);
    } finally {
      setIsSavingBlindBox(false);
    }
  }

  async function handleRewardGroupSubmit(values: UpsertRewardGroupInput) {
    setIsSavingRewardGroup(true);
    setPageMessage(null);

    try {
      const rewardGroup = await api.upsertRewardGroup({
        ...values,
        id: linkedRewardGroup?.id,
      });
      await api.upsertRewardGroupLink({
        blindBoxId,
        rewardGroupId: rewardGroup.id,
      });
      toast.success("Reward collection saved and linked.");
      blindBoxResource.reload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save the reward collection link.";
      setPageMessage(message);
      toast.error(message);
    } finally {
      setIsSavingRewardGroup(false);
    }
  }

  return (
    <AdminLayout>
      <div className="admin-content-area stack-xl">
        <PageHeader
          eyebrow="Configure"
          title="Detected Blind Box"
          description="SHOPLINE owns the product identity. This page only stores local operational settings, collection linkage, and assignment readiness."
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
          <SectionCard title="Loading configuration" description="Fetching blind-box reference and reward-group data.">
            <StatePanel
              title={api.isReady ? "Loading blind-box product" : "Preparing admin session"}
              description={
                api.initializationError?.message ||
                (api.isReady
                  ? "Pulling the latest blind-box configuration from the admin API."
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
          </SectionCard>
        ) : blindBoxResource.error ? (
          <SectionCard title="Unable to load blind-box product" description="The requested configuration could not be retrieved.">
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
          <SectionCard title="Blind-box product not found" description="The requested blind-box reference does not exist for this shop.">
            <StatePanel
              title="Missing blind-box product"
              description="Return to the list and select an auto-detected blind-box product."
              action={
                <Link className="button button-secondary" to={embeddedPath("/blind-box/pools")}>
                  Back To Blind Box Products
                </Link>
              }
            />
          </SectionCard>
        ) : (
          <>
            <div className="status-row">
              <StatusBadge value={blindBoxResource.data.blindBox.status} />
              <StatusBadge value={blindBoxResource.data.blindBox.selectionStrategy} />
              <StatusBadge value={readinessBadge} />
              <span className="section-meta">
                {blindBoxResource.isRefreshing ? "Refreshing..." : "Configuration loaded"}
              </span>
            </div>

            <SectionCard
              title="Blind-box settings"
              description="The product itself stays in SHOPLINE admin. This backend record only stores local settings for the detected product."
            >
              <BlindBoxForm
                key={blindBoxResource.data.blindBox.id}
                initialValues={getBlindBoxFormValues(blindBoxResource.data.blindBox)}
                submitLabel="Save Blind Box Settings"
                isSubmitting={isSavingBlindBox}
                onSubmit={handleBlindBoxSubmit}
              />
            </SectionCard>

            <div className="dashboard-grid dashboard-grid--split">
              <SectionCard
                title="Reward collection"
                description="Primary path: define the reward collection with the SHOPLINE product tag blind-box-collection:<handle>. The admin mapping below remains available only as a backward-compatible fallback."
              >
                <div className="stack-md">
                  <div className="info-list-item">
                    <strong>Current resolution</strong>
                    <span>{collectionResolutionHint}</span>
                    {resolvedCollection ? (
                      <>
                        <span>
                          Collection <code className="inline-code">{resolvedCollection.id}</code>
                        </span>
                        <span>
                          Handle{" "}
                          <code className="inline-code">
                            {resolvedCollection.handle || "unknown-handle"}
                          </code>
                        </span>
                      </>
                    ) : null}
                    {linkedRewardGroup ? (
                      <span>Legacy fallback updated {formatDateTime(linkedRewardGroup.updatedAt)}</span>
                    ) : null}
                  </div>
                  <div className="info-list-item">
                    <strong>Legacy fallback</strong>
                    <span>
                      Use this only for older products that do not yet define
                      {" "}
                      <code className="inline-code">blind-box-collection:&lt;handle&gt;</code>
                      {" "}
                      in SHOPLINE.
                    </span>
                  </div>
                  <RewardGroupForm
                    key={linkedRewardGroup?.id || "new-reward-group"}
                    initialValues={linkedRewardGroup || undefined}
                    isSubmitting={isSavingRewardGroup}
                    onSubmit={handleRewardGroupSubmit}
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Migration note"
                description="Manual blind-box registration is deprecated. Detected SHOPLINE products are now the primary source of truth."
              >
                <div className="stack-md">
                  <div className="info-list-item">
                    <strong>Source of truth</strong>
                    <span>SHOPLINE admin owns the blind-box product and reward collection membership.</span>
                  </div>
                  <div className="info-list-item">
                    <strong>Backend ownership</strong>
                    <span>The backend now owns only linking, assignment persistence, inventory execution, and diagnostics.</span>
                  </div>
                  <div className="info-list-item">
                    <strong>Legacy compatibility</strong>
                    <span>
                      Existing manual pool and sold-mapping records remain readable during migration, but they are deprecated.
                    </span>
                  </div>
                </div>
              </SectionCard>
            </div>

            <SectionCard
              title="Readiness & Candidate Health"
              description="Use this to confirm the linked collection resolves to eligible reward candidates for the detected blind-box product."
              actions={
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={blindBoxResource.reload}
                >
                  Refresh
                </button>
              }
            >
              {!readiness ? (
                readinessError ? (
                  <StatePanel
                    title="Readiness request failed"
                    description={readinessError}
                  />
                ) : (
                  <StatePanel
                    title="Readiness not available yet"
                    description="Refresh after the blind-box product is tagged in SHOPLINE with blind-box and blind-box-collection:<handle>, or keep the legacy fallback link if the product is still unmigrated."
                  />
                )
              ) : (
                <div className="stack-lg">
                  <div className="readiness-grid">
                    <div className="info-list-item">
                      <strong>Mode</strong>
                      <span>{formatOptionalValue(readiness.mode)}</span>
                    </div>
                    <div className="info-list-item">
                      <strong>Collection size</strong>
                      <span>{readiness.rawCollectionSize} products returned from SHOPLINE</span>
                    </div>
                    <div className="info-list-item">
                      <strong>Eligible candidates</strong>
                      <span>{eligibleCandidates.length}</span>
                    </div>
                    <div className="info-list-item">
                      <strong>Excluded candidates</strong>
                      <span>{excludedCandidates.length}</span>
                    </div>
                  </div>

                  <div className="info-list-item">
                    <strong>Summary</strong>
                    <span>{readiness.summary}</span>
                  </div>

                  {readiness.issues.length > 0 ? (
                    <div className="stack-sm">
                      {readiness.issues.map((issue) => (
                        <div className="info-list-item" key={issue.code}>
                          <strong>{issue.code}</strong>
                          <span>{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="dashboard-grid dashboard-grid--split">
                    <div className="stack-sm">
                      <strong>Eligible rewards</strong>
                      {eligibleCandidates.length > 0 ? (
                        eligibleCandidates.map((candidate) => (
                          <div className="info-list-item" key={`${candidate.productId}:${candidate.variantId || "product"}`}>
                            <strong>{candidate.productTitle || candidate.productId}</strong>
                            <span>
                              Product <code className="inline-code">{candidate.productId}</code>
                            </span>
                            <span>
                              Variant <code className="inline-code">{candidate.variantId || "product-level"}</code>
                            </span>
                            <span>Inventory snapshot {formatOptionalValue(candidate.inventoryQuantity)}</span>
                          </div>
                        ))
                      ) : (
                        <span className="section-meta">No eligible rewards currently resolved.</span>
                      )}
                    </div>

                    <div className="stack-sm">
                      <strong>Excluded rewards</strong>
                      {excludedCandidates.length > 0 ? (
                        excludedCandidates.map((candidate, index) => (
                          <div className="info-list-item" key={`${candidate.reason}-${candidate.productId || index}`}>
                            <strong>{candidate.productTitle || candidate.productId || "Unknown product"}</strong>
                            <span>{candidate.reason}</span>
                            <span>{candidate.message}</span>
                          </div>
                        ))
                      ) : (
                        <span className="section-meta">No exclusions. Candidate health is clean.</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Recent Activity"
              description="Most recent assignments and inventory operations for this blind-box product reference."
            >
              <div className="dashboard-grid dashboard-grid--split">
                <div className="stack-sm">
                  <strong>Recent assignments</strong>
                  {blindBoxResource.data.recentAssignments.length > 0 ? (
                    blindBoxResource.data.recentAssignments.map((assignment) => (
                      <div className="info-list-item" key={assignment.id}>
                        <strong>{assignment.orderId}</strong>
                        <span>Line {assignment.orderLineId}</span>
                        <span>
                          Reward{" "}
                          {assignment.selectedRewardTitleSnapshot ||
                            assignment.selectedRewardProductId ||
                            assignment.selectedPoolItemId ||
                            "Unknown"}
                        </span>
                        <span>Status {assignment.status}</span>
                      </div>
                    ))
                  ) : (
                    <span className="section-meta">No assignments recorded yet.</span>
                  )}
                </div>

                <div className="stack-sm">
                  <strong>Recent inventory operations</strong>
                  {blindBoxResource.data.recentOperations.length > 0 ? (
                    blindBoxResource.data.recentOperations.map((operation) => (
                      <div className="info-list-item" key={operation.id}>
                        <strong>{operation.operationType}</strong>
                        <span>Status {operation.status}</span>
                        <span>
                          Reward{" "}
                          {operation.rewardTitleSnapshot ||
                            operation.rewardProductId ||
                            operation.poolItemId ||
                            "Unknown"}
                        </span>
                        <span>Updated {formatDateTime(operation.updatedAt)}</span>
                      </div>
                    ))
                  ) : (
                    <span className="section-meta">No inventory operations recorded yet.</span>
                  )}
                </div>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
