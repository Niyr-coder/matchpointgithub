import { getLigaData } from "@/server/actions/tournament-liga";
import { LigaOperacionPanelView } from "./LigaOperacionPanelView";

export async function LigaOperacionPanel({
  tournamentId,
  categoryId,
  categoryName,
  tournamentFormat,
  registrationLabels,
}: {
  tournamentId: string;
  categoryId: string;
  categoryName: string;
  tournamentFormat: string;
  registrationLabels: Record<string, string>;
}) {
  const data = await getLigaData(tournamentId, categoryId);
  return (
    <LigaOperacionPanelView
      tournamentId={tournamentId}
      categoryId={categoryId}
      categoryName={categoryName}
      tournamentFormat={tournamentFormat}
      registrationLabels={registrationLabels}
      initialData={data}
    />
  );
}
