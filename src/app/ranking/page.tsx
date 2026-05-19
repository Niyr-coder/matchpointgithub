import { getRanking } from "@/server/actions/ranking";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { RankingPageView } from "@/components/landing/ranking/RankingPageView";

const VALID = ["pickleball", "padel", "tennis"] as const;
type Sport = (typeof VALID)[number];
const VALID_MODES = ["singles", "doubles"] as const;
type Mode = (typeof VALID_MODES)[number];

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string; mode?: string }>;
}) {
  const { sport: rawSport, mode: rawMode } = await searchParams;
  const sport: Sport = (VALID as readonly string[]).includes(rawSport ?? "") ? (rawSport as Sport) : "pickleball";
  const mode: Mode = (VALID_MODES as readonly string[]).includes(rawMode ?? "") ? (rawMode as Mode) : "singles";
  const r = await getRanking({ sport, mode, pageSize: 30 });
  const entries = r.ok ? r.data : [];
  return (
    <PublicChrome>
      <RankingPageView sport={sport} mode={mode} entries={entries} />
    </PublicChrome>
  );
}
