import { getRanking } from "@/server/actions/ranking";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { RankingPageView } from "@/components/landing/ranking/RankingPageView";

const VALID = ["pickleball", "padel", "tennis"] as const;
type Sport = (typeof VALID)[number];

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const { sport: raw } = await searchParams;
  const sport: Sport = (VALID as readonly string[]).includes(raw ?? "") ? (raw as Sport) : "pickleball";
  const r = await getRanking({ sport, pageSize: 30 });
  const entries = r.ok ? r.data : [];
  return (
    <PublicChrome>
      <RankingPageView sport={sport} entries={entries} />
    </PublicChrome>
  );
}
