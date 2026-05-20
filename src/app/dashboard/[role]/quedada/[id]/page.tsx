// Página de gestión de una Quedada (creador / co-host). Vive bajo
// /dashboard/[role]/quedada/[id], así hereda el chrome (sidebar + topbar +
// guard de rol) del layout [role]. El panel fetchea sus datos en cliente y
// valida el permiso real (canManage) server-side; si no puede gestionar,
// muestra el aviso correspondiente.
import { QuedadaManagePanel } from "@/components/dashboard/user/QuedadaManagePanel";

export default async function QuedadaManagePage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { id } = await params;
  return (
    <div style={{ maxWidth: 920, margin: "0 auto", width: "100%" }}>
      <QuedadaManagePanel quedadaId={id} variant="page" />
    </div>
  );
}
