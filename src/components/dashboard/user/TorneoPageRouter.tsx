"use client";

import {
  TournamentDetailView,
  type MyRegistration,
  type TournamentInscrito,
} from "@/components/dashboard/eventos/TournamentDetailView";
import type { TournamentDetail } from "@/lib/schemas/tournaments";
import type { TournamentBracketSideView, TournamentPlayerMatchView } from "@/lib/torneos/player-matches";
import { buildTorneoPlayerShell } from "@/lib/torneos/player-view";
import { TorneoDetailView } from "./TorneoDetailView";

type Props = {
  detail: TournamentDetail;
  clubName: string | null;
  clubCity: string | null;
  myRegistration: MyRegistration | null;
  inscritos?: TournamentInscrito[];
  meUserId: string | null;
  categoryRegistrationCounts?: Record<string, number>;
  scheduleBlocks?: import("@/lib/tournaments/schedule-display").TournamentScheduleBlockView[];
  myMatches?: TournamentPlayerMatchView[];
  bracketSides?: TournamentBracketSideView[];
};

export function TorneoPageRouter({
  detail,
  clubName,
  clubCity,
  myRegistration,
  inscritos = [],
  meUserId,
  categoryRegistrationCounts = {},
  scheduleBlocks = [],
  myMatches = [],
  bracketSides = [],
}: Props) {
  if (myRegistration) {
    const shell = buildTorneoPlayerShell(detail, clubName, myRegistration.status);
    return (
      <TorneoDetailView
        shell={shell}
        detail={detail}
        myMatches={myMatches}
        bracketSides={bracketSides}
      />
    );
  }

  return (
    <TournamentDetailView
      detail={detail}
      clubName={clubName}
      clubCity={clubCity}
      myRegistration={myRegistration}
      inscritos={inscritos}
      meUserId={meUserId}
      categoryRegistrationCounts={categoryRegistrationCounts}
      scheduleBlocks={scheduleBlocks}
    />
  );
}
