import { listAdminReceptionOverview } from "@/server/actions/admin/reception";
import { AdminRecepcionScreenView } from "./AdminRecepcionScreenView";

export async function AdminRecepcionScreen() {
  const res = await listAdminReceptionOverview();
  if (!res.ok) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <h1
          className="font-heading"
          style={{
            margin: "6px 0 0",
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
          }}
        >
          No se pudo cargar recepción<span className="dot">.</span>
        </h1>
        <p style={{ margin: "8px 0 0", color: "var(--muted-fg)", fontSize: 13 }}>
          {res.error.message}
        </p>
      </div>
    );
  }

  return <AdminRecepcionScreenView data={res.data} />;
}
