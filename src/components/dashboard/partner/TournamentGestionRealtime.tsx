"use client";
// Suscripción realtime sutil para la página de gestión del torneo. Cuando
// otro partner/admin edita categorías, cronograma, premios o el torneo
// mismo, este wrapper dispara router.refresh() para que veamos los cambios
// sin tener que recargar manualmente.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export function TournamentGestionRealtime({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  useRealtimeRefresh(
    [
      { table: "tournaments", filter: `id=eq.${tournamentId}` },
      { table: "tournament_categories", filter: `tournament_id=eq.${tournamentId}` },
      { table: "tournament_schedule_blocks", filter: `tournament_id=eq.${tournamentId}` },
      { table: "tournament_prizes", filter: `tournament_id=eq.${tournamentId}` },
      { table: "registrations", filter: `tournament_id=eq.${tournamentId}` },
      { table: "tournament_groups" },
      { table: "tournament_group_matches" },
      { table: "brackets", filter: `tournament_id=eq.${tournamentId}` },
      { table: "bracket_matches" },
    ],
    { enabled: true },
  );
  // Por si useRealtimeRefresh no dispara router.refresh por sí solo en
  // algunos casos: este efecto es redundante seguro pero no daña.
  useEffect(() => {
    router.prefetch(`/dashboard/partner/torneo/${tournamentId}`);
  }, [router, tournamentId]);
  return null;
}
