import { getMyGiveawaysDashboard } from "@/server/actions/giveaways";
import { MyGiveawaysViewClient } from "@/components/dashboard/giveaways/MyGiveawaysViewClient";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";

import type { MyGiveawaysDashboard } from "@/lib/schemas/giveaways";

const EMPTY_DASHBOARD: MyGiveawaysDashboard = {
  displayName: "Jugador",
  username: null,
  adentro: [],
  pendientes: [],
  ganados: [],
  pasados: [],
  unlockActions: [],
  nextDraw: null,
  stats: { adentro: 0, pendientes: 0, ganados: 0, pasados: 0, winRatePct: 0 },
};

export async function MyGiveawaysScreen() {
  const res = await getMyGiveawaysDashboard({});
  if (res.ok) {
    return <MyGiveawaysViewClient dashboard={res.data} />;
  }

  const session = await getSession();
  const profile =
    session.authenticated ? await getProfileSummary(session.session.userId) : null;
  const displayName = profile?.displayName ?? profile?.username ?? "Jugador";
  const username = profile?.username ?? null;

  return (
    <MyGiveawaysViewClient
      dashboard={{ ...EMPTY_DASHBOARD, displayName, username }}
    />
  );
}
