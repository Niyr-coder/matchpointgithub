"use client";

import { REALTIME_DEBOUNCE } from "@/lib/realtime/debounce";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";

/**
 * Refresca la vista de jugador cuando cambian grupos, marcadores o llave de
 * ESTE torneo. Todas las tablas filtran server-side por tournament_id (mig
 * 20260715000000) salvo tournament_group_members (solo tiene group_id y sus
 * eventos son raros: sorteo/sustituciones — el debounce absorbe el resto).
 */
export function TorneoPlayerRealtime({ tournamentId }: { tournamentId: string }) {
  useRealtimeRefresh(
    [
      { table: "tournaments", filter: `id=eq.${tournamentId}` },
      { table: "tournament_categories", filter: `tournament_id=eq.${tournamentId}` },
      { table: "registrations", filter: `tournament_id=eq.${tournamentId}` },
      { table: "tournament_groups", filter: `tournament_id=eq.${tournamentId}` },
      { table: "tournament_group_members" },
      { table: "tournament_group_matches", filter: `tournament_id=eq.${tournamentId}` },
      { table: "brackets", filter: `tournament_id=eq.${tournamentId}` },
      { table: "bracket_matches", filter: `tournament_id=eq.${tournamentId}` },
    ],
    { enabled: !!tournamentId, debounceMs: REALTIME_DEBOUNCE.LIVE },
  );
  return null;
}
