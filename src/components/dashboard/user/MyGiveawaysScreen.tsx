import { getMyGiveawaysDashboard } from "@/server/actions/giveaways";
import { MyGiveawaysViewClient } from "@/components/dashboard/giveaways/MyGiveawaysViewClient";

export async function MyGiveawaysScreen() {
  const res = await getMyGiveawaysDashboard({});
  const dashboard = res.ok
    ? res.data
    : {
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
  return <MyGiveawaysViewClient dashboard={dashboard} />;
}
