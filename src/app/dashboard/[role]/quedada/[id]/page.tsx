// Página de una Quedada bajo /dashboard/[role]/quedada/[id]: hereda el chrome
// (sidebar + topbar + guard de rol) del layout [role]. El router de cliente
// decide gestión (solo creador/co-host de ESTA quedada) vs vista jugador;
// precargamos read-only en server para el primer paint del jugador.
import { notFound } from "next/navigation";
import { FeatureOffScreen } from "@/components/dashboard/FeatureOffScreen";
import { QuedadaPageRouter } from "@/components/dashboard/user/QuedadaPageRouter";
import { getMyEffectiveFlags } from "@/server/actions/featureFlags";
import { loadQuedadaPlayerView } from "@/server/queries/quedada-player-view";
import { MpError } from "@/lib/api/errors";

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

  let initialPlayerData = null;
  try {
    initialPlayerData = await loadQuedadaPlayerView(id);
  } catch (e) {
    if (e instanceof MpError) {
      if (e.code === "QUEDADAS.NOT_FOUND") notFound();
      if (e.code === "QUEDADAS.FORBIDDEN") {
        return (
          <div className="card" style={{ padding: 24, maxWidth: 480 }}>
            <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase" }}>
              Sin acceso<span className="dot">.</span>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
              {e.message}
            </p>
          </div>
        );
      }
    }
    throw e;
  }

  return (
    <div style={{ width: "100%" }}>
      <QuedadaPageRouter quedadaId={id} initialPlayerData={initialPlayerData} />
    </div>
  );
}
