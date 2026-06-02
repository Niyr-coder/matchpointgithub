import { listAdminSalesLeads } from "@/server/actions/admin/sales";
import { AdminSalesScreenView } from "./AdminSalesScreenView";

export async function AdminSalesScreen() {
  const res = await listAdminSalesLeads({ limit: 250 });

  if (!res.ok) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <h1
          className="font-heading"
          style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: 0 }}
        >
          Ventas<span className="dot">.</span>
        </h1>
        <p style={{ margin: "12px 0 0", color: "#b91c1c", fontSize: 13 }}>
          No se pudo cargar el CRM: {res.error.message}
        </p>
      </div>
    );
  }

  return <AdminSalesScreenView initialData={res.data} />;
}
