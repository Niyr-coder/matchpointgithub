"use client";
// Suscripción realtime de la página de gestión del torneo. Las tablas con
// columna de torneo se filtran server-side; las de scoring (bracket_matches,
// tournament_group_matches, tournament_groups) NO tienen tournament_id, así
// que se filtran client-side por los ids del torneo (isRelevant) — sin eso,
// cada punto anotado en cualquier torneo de la plataforma re-ejecutaba esta
// página completa (audit de costos 2026-07-01).
import {
  useScopedRealtimeRefresh,
  payloadId,
} from "../useScopedRealtimeRefresh";

export function TournamentGestionRealtime({
  tournamentId,
  bracketIds,
  categoryIds,
  groupIds,
}: {
  tournamentId: string;
  bracketIds: string[];
  categoryIds: string[];
  groupIds: string[];
}) {
  const bracketSet = new Set(bracketIds);
  const categorySet = new Set(categoryIds);
  const groupSet = new Set(groupIds);

  useScopedRealtimeRefresh(
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
    {
      isRelevant: (table, payload) => {
        if (table === "bracket_matches") {
          const bid = payloadId(payload, "bracket_id");
          return bid == null ? true : bracketSet.has(bid);
        }
        if (table === "tournament_group_matches") {
          const gid = payloadId(payload, "group_id");
          return gid == null ? true : groupSet.has(gid);
        }
        if (table === "tournament_groups") {
          const cid = payloadId(payload, "category_id");
          return cid == null ? true : categorySet.has(cid);
        }
        // El resto ya llega filtrado server-side.
        return true;
      },
    },
  );

  return null;
}
