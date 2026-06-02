// Página de una Quedada bajo /dashboard/[role]/quedada/[id]: hereda el chrome
// (sidebar + topbar + guard de rol) del layout [role]. El router de cliente
// fetchea una vez y monta la GESTIÓN (creador/co-host) o el DETALLE read-only
// (jugador) según `canManage`.
import { FeatureOffScreen } from "@/components/dashboard/FeatureOffScreen";
import { QuedadaPageRouter } from "@/components/dashboard/user/QuedadaPageRouter";
import { getMyEffectiveFlags } from "@/server/actions/featureFlags";

export default async function QuedadaPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { id } = await params;
  const flags = await getMyEffectiveFlags();
  if (flags.ok && flags.data.quedadas_enabled === false) {
    return <FeatureOffScreen section="quedadas" />;
  }

  return (
    <div style={{ width: "100%" }}>
      <QuedadaPageRouter quedadaId={id} />
    </div>
  );
}
