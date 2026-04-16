import { Link } from "react-router-dom";
import { useState } from "react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { PageHeader } from "../../../components/admin/PageHeader";
import { SectionCard } from "../../../components/admin/SectionCard";
import { BlindBoxForm } from "../../../components/blind-box/BlindBoxForm";
import { useBlindBoxAdminApi } from "../../../hooks/useBlindBoxAdminApi";
import {
  useEmbeddedNavigate,
  useEmbeddedPath,
} from "../../../hooks/useEmbeddedRouting";
import { useToast } from "../../../hooks/useToast";
import type { CreateBlindBoxInput } from "../../../types/blindBox";

export default function CreateBlindBoxPage() {
  const api = useBlindBoxAdminApi();
  const toast = useToast();
  const navigate = useEmbeddedNavigate();
  const embeddedPath = useEmbeddedPath();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  async function handleSubmit(values: CreateBlindBoxInput) {
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const blindBox = await api.createBlindBox(values);
      toast.success("Blind box created.");
      navigate(`/blind-box/pools/${blindBox.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create blind box.";
      setSubmissionError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminLayout>
      <div className="admin-content-area stack-xl">
        <PageHeader
          eyebrow="Create"
          title="Create Blind Box"
          description="Set up the pool shell first. Items and product mappings can be added immediately after creation."
          actions={
            <Link className="button button-secondary" to={embeddedPath("/blind-box/pools")}>
              Back To List
            </Link>
          }
        />

        <div className="dashboard-grid dashboard-grid--split">
          <SectionCard
            title="Basic configuration"
            description="The frontend only saves merchant-managed metadata. Assignment behavior stays in backend services."
          >
            {submissionError ? (
              <div className="inline-banner inline-banner-error">{submissionError}</div>
            ) : null}
            <BlindBoxForm
              submitLabel="Create Blind Box"
              isSubmitting={isSubmitting}
              onSubmit={handleSubmit}
            />
          </SectionCard>

          <SectionCard
            title="What happens next"
            description="After creation, continue in the edit screen to finish the operational setup."
          >
            <div className="stack-md">
              <div className="info-list-item">
                <strong>Pool items</strong>
                <span>Add prizes, inventory quantities, weights, and enabled states.</span>
              </div>
              <div className="info-list-item">
                <strong>Product mappings</strong>
                <span>Attach the store product or variant that should trigger the blind-box flow.</span>
              </div>
              <div className="info-list-item">
                <strong>Assignments</strong>
                <span>Use the assignment history page to monitor live order outcomes after paid orders arrive.</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </AdminLayout>
  );
}
