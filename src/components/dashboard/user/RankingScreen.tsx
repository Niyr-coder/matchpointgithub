// Server component: fetch ranking + history + me, pasa a RankingScreenClient.
// Trae singles y doubles en paralelo — player_stats está particionado por modo
// desde la migration 064, y la UI tiene tabs para alternar.
import { getRanking, getUserRankingHistory } from "@/server/actions/ranking";
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { getPlanForUser } from "@/lib/auth/plan";
import type { RankingEntry, RankingSnapshot } from "@/lib/schemas/ranking";
import { RankingScreenClient } from "./RankingScreenClient";

export type RankingModeData = {
  entries: RankingEntry[];
  myRank: number | null;
  currentRating: number | null;
  history: RankingSnapshot[];
};

export type RankingData = {
  singles: RankingModeData;
  doubles: RankingModeData;
};

function findMe(entries: RankingEntry[], meUserId: string | null) {
  if (!meUserId) return { rank: null, rating: null } as const;
  const me = entries.find((e) => e.userId === meUserId);
  return { rank: me?.rank ?? null, rating: me?.currentRating ?? null } as const;
}

export async function RankingScreen() {
  const session = await getSession();
  const meUserId = session.authenticated ? session.session.userId : null;

  const emptyHistory = Promise.resolve({ ok: true as const, data: [] as RankingSnapshot[] });

  const [singlesRes, doublesRes, historyRes, plan] = await Promise.all([
    getRanking({ sport: "pickleball", mode: "singles", pageSize: 30 }),
    getRanking({ sport: "pickleball", mode: "doubles", pageSize: 30 }),
    // ranking_snapshots aún no tiene columna `mode` (ver 019_ranking.sql); por
    // ahora ambas tabs comparten el mismo historial. Cuando se split, basta
    // con duplicar este fetch con .eq("mode", ...).
    meUserId
      ? getUserRankingHistory({ userId: meUserId, sport: "pickleball", limit: 100 })
      : emptyHistory,
    (async () => {
      if (!meUserId) return { tier: "free" as const };
      const supabase = await getServerClient();
      // getPlanForUser normaliza Premium expirado a Free automáticamente.
      const p = await getPlanForUser(supabase, meUserId);
      return { tier: p.tier };
    })(),
  ]);

  const singlesEntries = singlesRes.ok ? singlesRes.data : [];
  const doublesEntries = doublesRes.ok ? doublesRes.data : [];
  const history = historyRes.ok ? historyRes.data : [];

  const singlesMe = findMe(singlesEntries, meUserId);
  const doublesMe = findMe(doublesEntries, meUserId);

  const data: RankingData = {
    singles: {
      entries: singlesEntries,
      myRank: singlesMe.rank,
      currentRating: singlesMe.rating,
      // Si no tiene matches en este modo, no mostramos historial sintético.
      history: singlesMe.rating != null ? history : [],
    },
    doubles: {
      entries: doublesEntries,
      myRank: doublesMe.rank,
      currentRating: doublesMe.rating,
      history: doublesMe.rating != null ? history : [],
    },
  };

  return (
    <RankingScreenClient
      data={data}
      meUserId={meUserId}
      isPremium={plan.tier === "premium"}
    />
  );
}
