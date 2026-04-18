import { Link } from "react-router-dom";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { PageHeader } from "../../../components/admin/PageHeader";
import { SectionCard } from "../../../components/admin/SectionCard";
import { StatePanel } from "../../../components/admin/StatePanel";
import { useEmbeddedPath } from "../../../hooks/useEmbeddedRouting";

export default function CreateBlindBoxPage() {
  const embeddedPath = useEmbeddedPath();

  return (
    <AdminLayout>
      <div className="admin-content-area stack-xl">
        <PageHeader
          eyebrow="Deprecated"
          title="Manual Registration Removed"
          description='Blind-box products are no longer created in the app admin. Detection now happens automatically from tagged SHOPLINE products.'
          actions={
            <Link className="button button-secondary" to={embeddedPath("/blind-box/pools")}>
              Back To Detected Blind Boxes
            </Link>
          }
        />

        <div className="dashboard-grid dashboard-grid--split">
          <SectionCard
            title="New setup flow"
            description="Use SHOPLINE admin as the source of truth for blind-box identity."
          >
            <StatePanel
              title="No registration form required"
              description='1. Create the product in SHOPLINE. 2. Add the "blind-box" tag. 3. Add the "blind-box-collection:<handle>" tag. 4. Refresh the detected list.'
            />
          </SectionCard>

          <SectionCard
            title="What happens next"
            description="The app now stores only cached references plus operational settings."
          >
            <div className="stack-md">
              <div className="info-list-item">
                <strong>Detection</strong>
                <span>Tagged products are auto-hydrated into the local blind-box cache when the admin list or webhook sees them.</span>
              </div>
              <div className="info-list-item">
                <strong>Reward collection</strong>
                <span>The product tag blind-box-collection:&lt;handle&gt; is now the primary reward source. Use the admin fallback link only for older products that are not migrated yet.</span>
              </div>
              <div className="info-list-item">
                <strong>Readiness</strong>
                <span>Use readiness and candidate health to confirm the tagged collection can assign rewards safely.</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </AdminLayout>
  );
}
