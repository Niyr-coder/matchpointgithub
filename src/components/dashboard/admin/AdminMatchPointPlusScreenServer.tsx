// Server: MERGE de la pantalla MATCHPOINT+ (rediseño analytics/pricing) con el
// backend operativo REAL. Carga la cola de aprobación de comprobantes de plan
// premium (player_subscriptions) y de featuring de clubes
// (club_featuring_subscriptions), más el historial reciente y el conteo de
// clubes destacados activos, y se los pasa al rediseño AdminMatchPointPlusScreen
// como prop `data`. La pantalla operativa previa (AdminPlansScreen +
// AdminPlansScreenView) queda preservada/des-importada como respaldo y fuente
// de tipos. Mismo patrón que AdminRolesScreen / AdminAuditScreen.
//
// Reusa las acciones reales:
//   - listPendingPlanSubscriptionsAdmin / listRecentPlanSubscriptionsAdmin (admin-plans.ts)
//   - listPendingClubFeaturingAdmin / listRecentClubFeaturingAdmin / countActiveFeaturedClubsAdmin (admin-club-featuring.ts)
// La aprobación/rechazo se dispara desde el cliente (AdminMatchPointPlusScreen)
// con approvePlanSubscriptionAdmin / rejectPlanSubscriptionAdmin /
// approveClubFeaturingAdmin / rejectClubFeaturingAdmin.

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
import { AdminMatchPointPlusScreen, type AdminPlusData } from "./AdminMatchPointPlusScreen";

export async function AdminMatchPointPlusScreenServer() {
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

  const pending: PendingPlanSubscriptionRow[] = pendingRes.ok ? pendingRes.data : [];
  const recent: RecentPlanSubscriptionRow[] = recentRes.ok ? recentRes.data : [];
  const pendingFeaturing: PendingClubFeaturingRow[] = pendingFeaturingRes.ok
    ? pendingFeaturingRes.data
    : [];
  const recentFeaturing: RecentClubFeaturingRow[] = recentFeaturingRes.ok
    ? recentFeaturingRes.data
    : [];
  const activeFeaturedCount: number = activeFeaturedRes.ok
    ? activeFeaturedRes.data.count
    : 0;

  const data: AdminPlusData = {
    pending,
    recent,
    pendingFeaturing,
    recentFeaturing,
    activeFeaturedCount,
  };

  return <AdminMatchPointPlusScreen data={data} />;
}
