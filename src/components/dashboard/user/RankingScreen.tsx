// Server component: fetch ranking + history + me, pasa a RankingScreenClient.
import { getRanking, getUserRankingHistory } from "@/server/actions/ranking";
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { getPlanForUser } from "@/lib/auth/plan";
import { RankingScreenClient } from "./RankingScreenClient";

export async function RankingScreen() {
  const session = await getSession();
  const meUserId = session.authenticated ? session.session.userId : null;

  const [rankingRes, historyRes, plan] = await Promise.all([
    getRanking({ sport: "pickleball", pageSize: 30 }),
    meUserId
      ? getUserRankingHistory({ userId: meUserId, sport: "pickleball", limit: 100 })
      : Promise.resolve({ ok: true as const, data: [] }),
    (async () => {
      if (!meUserId) return { tier: "free" as const };
      const supabase = await getServerClient();
      // getPlanForUser normaliza Premium expirado a Free automáticamente.
      const p = await getPlanForUser(supabase, meUserId);
      return { tier: p.tier };
    })(),
  ]);
  const entries = rankingRes.ok ? rankingRes.data : [];
  const history = historyRes.ok ? historyRes.data : [];
  const isPremium = plan.tier === "premium";

  return (
    <RankingScreenClient
      entries={entries}
      meUserId={meUserId}
      history={history}
      isPremium={isPremium}
    />
  );
}
