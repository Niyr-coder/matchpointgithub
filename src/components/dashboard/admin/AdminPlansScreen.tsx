// Server: planes de jugador (player_subscriptions) para admin.
// Lista pending + historial reciente. La aprobación delega a
// approvePlanSubscriptionAdmin (player-subscriptions.ts).

import {
  listPendingPlanSubscriptionsAdmin,
  listRecentPlanSubscriptionsAdmin,
  type PendingPlanSubscriptionRow,
  type RecentPlanSubscriptionRow,
} from "@/server/actions/admin-plans";
import { AdminPlansScreenView } from "./AdminPlansScreenView";

export async function AdminPlansScreen() {
  const [pendingRes, recentRes] = await Promise.all([
    listPendingPlanSubscriptionsAdmin(),
    listRecentPlanSubscriptionsAdmin({ limit: 30 }),
  ]);

  const pending: PendingPlanSubscriptionRow[] = pendingRes.ok
    ? pendingRes.data
    : [];
  const recent: RecentPlanSubscriptionRow[] = recentRes.ok
    ? recentRes.data
    : [];

  return <AdminPlansScreenView pending={pending} recent={recent} />;
}
