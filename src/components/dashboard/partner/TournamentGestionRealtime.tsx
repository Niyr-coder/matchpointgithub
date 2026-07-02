"use client";
// Suscripción realtime de la página de gestión del torneo. TODAS las tablas
// se filtran server-side por tournament_id (denormalizado en mig
// 20260715000000) — el CDC solo entrega eventos de ESTE torneo, sin fanout
// global ni filtrado client-side.
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export function TournamentGestionRealtime({ tournamentId }: { tournamentId: string }) {
  useRealtimeRefresh([
    { table: "tournaments", filter: `id=eq.${tournamentId}` },
    { table: "tournament_categories", filter: `tournament_id=eq.${tournamentId}` },
    { table: "tournament_schedule_blocks", filter: `tournament_id=eq.${tournamentId}` },
    { table: "tournament_prizes", filter: `tournament_id=eq.${tournamentId}` },
    { table: "registrations", filter: `tournament_id=eq.${tournamentId}` },
    { table: "tournament_groups", filter: `tournament_id=eq.${tournamentId}` },
    { table: "tournament_group_matches", filter: `tournament_id=eq.${tournamentId}` },
    { table: "brackets", filter: `tournament_id=eq.${tournamentId}` },
    { table: "bracket_matches", filter: `tournament_id=eq.${tournamentId}` },
  ]);
  return null;
}
