import { EmptyState } from "@/components/ui/EmptyState";
import { listAdminPartnersOverview } from "@/server/actions/admin/partners";
import { AdminPartnersScreenView } from "./AdminPartnersScreenView";

export async function AdminPartnersScreen() {
  const data = await listAdminPartnersOverview();

  if (data.rows.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div className="label-mp">Plataforma · Partners</div>
          <h1
            className="font-heading mp-admin-page-title"
            style={{
              margin: "6px 0 0",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
            }}
          >
            Partners<span className="dot">.</span>
          </h1>
        </div>
        <EmptyState
          icon="handshake"
          title="Sin partners registrados"
          hint="Cuando existan organizadores externos, aquí verás sus miembros, clubes asociados, torneos y finanzas básicas."
        />
      </div>
    );
  }

  return <AdminPartnersScreenView data={data} />;
}
