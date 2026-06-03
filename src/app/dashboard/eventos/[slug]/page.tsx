import { notFound } from "next/navigation";
import { TorneoPageRouter } from "@/components/dashboard/user/TorneoPageRouter";
import { loadTournamentDashboardPageData } from "@/server/queries/tournament-player-page";

export default async function DashboardTournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadTournamentDashboardPageData(slug);
  if (!data) notFound();

  return (
    <TorneoPageRouter
      detail={data.detail}
      clubName={data.clubName}
      clubCity={data.clubCity}
      myRegistration={data.myRegistration}
      inscritos={data.inscritos}
      meUserId={data.meUserId}
      myMatches={data.myMatches}
      bracketSides={data.bracketSides}
    />
  );
}
