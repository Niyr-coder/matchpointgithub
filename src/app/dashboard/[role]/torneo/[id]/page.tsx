import { notFound } from "next/navigation";
import { TorneoPageRouter } from "@/components/dashboard/user/TorneoPageRouter";
import { loadTournamentDashboardPageData } from "@/server/queries/tournament-player-page";

export default async function TorneoPlayerPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { id } = await params;
  const data = await loadTournamentDashboardPageData(id);
  if (!data) notFound();

  return (
    <div style={{ width: "100%" }}>
      <TorneoPageRouter
        detail={data.detail}
        clubName={data.clubName}
        clubCity={data.clubCity}
        myRegistration={data.myRegistration}
        inscritos={data.inscritos}
        meUserId={data.meUserId}
        categoryRegistrationCounts={data.categoryRegistrationCounts}
        scheduleBlocks={data.scheduleBlocks}
        myMatches={data.myMatches}
        bracketSides={data.bracketSides}
        groupView={data.groupView}
      />
    </div>
  );
}
