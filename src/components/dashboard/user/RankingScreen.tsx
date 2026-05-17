// Server component: fetch ranking + history + me, pasa a RankingScreenClient.
import { getRanking, getUserRankingHistory } from "@/server/actions/ranking";
import { getSession } from "@/lib/auth/session";
import { RankingScreenClient } from "./RankingScreenClient";

export async function RankingScreen() {
  const session = await getSession();
  const meUserId = session.authenticated ? session.session.userId : null;

  const [rankingRes, historyRes] = await Promise.all([
    getRanking({ sport: "pickleball", pageSize: 30 }),
    meUserId
      ? getUserRankingHistory({ userId: meUserId, sport: "pickleball", limit: 100 })
      : Promise.resolve({ ok: true as const, data: [] }),
  ]);
  const entries = rankingRes.ok ? rankingRes.data : [];
  const history = historyRes.ok ? historyRes.data : [];

  return <RankingScreenClient entries={entries} meUserId={meUserId} history={history} />;
}
