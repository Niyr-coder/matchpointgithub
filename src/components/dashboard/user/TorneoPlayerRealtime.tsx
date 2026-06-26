"use client";

import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { REALTIME_DEBOUNCE } from "@/lib/realtime/debounce";

/** Refresca la vista de jugador cuando cambian grupos, marcadores o llave. */
export function TorneoPlayerRealtime({ tournamentId }: { tournamentId: string }) {
  useRealtimeRefresh(
    [
      { table: "tournaments", filter: `id=eq.${tournamentId}` },
      { table: "tournament_categories", filter: `tournament_id=eq.${tournamentId}` },
      { table: "registrations", filter: `tournament_id=eq.${tournamentId}` },
      { table: "tournament_groups" },
      { table: "tournament_group_members" },
      { table: "tournament_group_matches" },
      { table: "brackets", filter: `tournament_id=eq.${tournamentId}` },
      { table: "bracket_matches" },
    ],
    { enabled: !!tournamentId, debounceMs: REALTIME_DEBOUNCE.LIVE },
  );
  return null;
}
