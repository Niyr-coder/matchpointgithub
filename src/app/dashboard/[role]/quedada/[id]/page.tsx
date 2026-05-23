// Página de una Quedada bajo /dashboard/[role]/quedada/[id]: hereda el chrome
// (sidebar + topbar + guard de rol) del layout [role]. El router de cliente
// fetchea una vez y monta la GESTIÓN (creador/co-host) o el DETALLE read-only
// (jugador) según `canManage`.
import { QuedadaPageRouter } from "@/components/dashboard/user/QuedadaPageRouter";

export default async function QuedadaPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { id } = await params;
  return (
    <div style={{ width: "100%" }}>
      <QuedadaPageRouter quedadaId={id} />
    </div>
  );
}
