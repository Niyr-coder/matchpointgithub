"use client";

import {
  TournamentDetailView,
  type MyRegistration,
  type TournamentInscrito,
} from "@/components/dashboard/eventos/TournamentDetailView";
import type { TournamentDetail } from "@/lib/schemas/tournaments";
import type { TournamentBracketSideView, TournamentPlayerGroupView, TournamentPlayerMatchView } from "@/lib/torneos/player-matches";
import { buildTorneoPlayerShell } from "@/lib/torneos/player-view";
import { TorneoDetailView } from "./TorneoDetailView";
import { TorneoPlayerRealtime } from "./TorneoPlayerRealtime";

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
  groupView?: TournamentPlayerGroupView | null;
  myTournamentSummary?: { wins: number; losses: number; deltaRating: number; rank: number | null } | null;
  myCategory?: { name: string | null; stage: string | null; championLabel: string | null } | null;
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
  groupView = null,
  myTournamentSummary = null,
  myCategory = null,
}: Props) {
  const tournamentId = detail.tournament.id;

  // Waitlist NO entra a la vista "dentro del torneo" (no está en el cuadro):
  // ve el detalle público, que muestra el estado "En lista de espera" y
  // permite abandonar la inscripción.
  if (myRegistration && myRegistration.status !== "waitlist") {
    const shell = buildTorneoPlayerShell(detail, clubName, myRegistration.status);
    return (
      <>
        <TorneoPlayerRealtime tournamentId={tournamentId} />
        <TorneoDetailView
          shell={shell}
          detail={detail}
          myRegistration={myRegistration}
          myMatches={myMatches}
          bracketSides={bracketSides}
          groupView={groupView}
          myTournamentSummary={myTournamentSummary}
          myCategory={myCategory}
        />
      </>
    );
  }

  return (
    <>
      <TorneoPlayerRealtime tournamentId={tournamentId} />
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
    </>
  );
}
