// Server: pantalla "Busco partido". Gate por feature flag match_seeks_enabled.
// Si está apagado, render honesto "Pronto". Si está prendido, fetchea el feed
// global (todas las ciudades, cercanos primero) + mis avisos y delega al client view.
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { getMyEffectiveFlags } from "@/server/actions/featureFlags";
import { listMatchSeeks, listMyApplications, listMyMatchSeeks, listPartnerInvitations } from "@/server/actions/match-seeks";
import { BuscoPartidoScreenView } from "./BuscoPartidoScreenView";
import { BuscoPartidoComingSoon } from "./BuscoPartidoScreenView";

export async function BuscoPartidoScreen({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session.authenticated) {
    return <BuscoPartidoComingSoon reason="auth" />;
  }

  const flagsRes = await getMyEffectiveFlags();
  const enabled = flagsRes.ok && flagsRes.data["match_seeks_enabled"] === true;
  if (!enabled) {
    return <BuscoPartidoComingSoon reason="flag" />;
  }

  const sp = searchParams ? await searchParams : {};
  const focusRaw = sp.focus;
  const focusSeekId = typeof focusRaw === "string" ? focusRaw : null;

  const [profile, feedRes, mineRes, appsRes, partnerInvitesRes] = await Promise.all([
    getProfileSummary(session.session.userId),
    listMatchSeeks({ allCities: true }),
    listMyMatchSeeks(),
    listMyApplications(),
    listPartnerInvitations(),
  ]);

  return (
    <BuscoPartidoScreenView
      meUserId={session.session.userId}
      myCity={profile.city}
      myPlanTier={profile.planTier}
      feed={feedRes.ok ? feedRes.data : []}
      mine={mineRes.ok ? mineRes.data : []}
      myApplications={appsRes.ok ? appsRes.data : []}
      partnerInvites={partnerInvitesRes.ok ? partnerInvitesRes.data : []}
      focusSeekId={focusSeekId}
    />
  );
}
