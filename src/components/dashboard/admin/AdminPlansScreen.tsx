// Server: planes de jugador (player_subscriptions) + featuring de clubes
// (club_featuring_subscriptions) para admin. Una sola pantalla
// "Planes y promociones" agrupa ambos flujos: cada uno con su sección de
// pendientes y su KPI propio. La aprobación de planes delega a
// approvePlanSubscriptionAdmin (player-subscriptions.ts); la de featuring
// a approveClubFeaturingAdmin (club-featuring.ts, Agente U).

import {
  listPendingPlanSubscriptionsAdmin,
  listRecentPlanSubscriptionsAdmin,
  type PendingPlanSubscriptionRow,
  type RecentPlanSubscriptionRow,
} from "@/server/actions/admin-plans";
import {
  countActiveFeaturedClubsAdmin,
  listPendingClubFeaturingAdmin,
  listRecentClubFeaturingAdmin,
  type PendingClubFeaturingRow,
  type RecentClubFeaturingRow,
} from "@/server/actions/admin-club-featuring";
import { AdminPlansScreenView } from "./AdminPlansScreenView";

export async function AdminPlansScreen() {
  const [
    pendingRes,
    recentRes,
    pendingFeaturingRes,
    recentFeaturingRes,
    activeFeaturedRes,
  ] = await Promise.all([
    listPendingPlanSubscriptionsAdmin(),
    listRecentPlanSubscriptionsAdmin({ limit: 30 }),
    listPendingClubFeaturingAdmin(),
    listRecentClubFeaturingAdmin({ limit: 30 }),
    countActiveFeaturedClubsAdmin(),
  ]);

  const pending: PendingPlanSubscriptionRow[] = pendingRes.ok
    ? pendingRes.data
    : [];
  const recent: RecentPlanSubscriptionRow[] = recentRes.ok
    ? recentRes.data
    : [];
  const pendingFeaturing: PendingClubFeaturingRow[] = pendingFeaturingRes.ok
    ? pendingFeaturingRes.data
    : [];
  const recentFeaturing: RecentClubFeaturingRow[] = recentFeaturingRes.ok
    ? recentFeaturingRes.data
    : [];
  const activeFeaturedCount: number = activeFeaturedRes.ok
    ? activeFeaturedRes.data.count
    : 0;

  return (
    <AdminPlansScreenView
      pending={pending}
      recent={recent}
      pendingFeaturing={pendingFeaturing}
      recentFeaturing={recentFeaturing}
      activeFeaturedCount={activeFeaturedCount}
    />
  );
}
