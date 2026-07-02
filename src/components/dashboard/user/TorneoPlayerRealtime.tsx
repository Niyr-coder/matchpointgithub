"use client";

import { REALTIME_DEBOUNCE } from "@/lib/realtime/debounce";
import {
  useScopedRealtimeRefresh,
  payloadId,
} from "@/components/dashboard/useScopedRealtimeRefresh";

export type TorneoRealtimeScope = {
  bracketIds: string[];
  categoryIds: string[];
  groupIds: string[];
};

/**
 * Refresca la vista de jugador cuando cambian grupos, marcadores o llave —
 * SOLO de este torneo. Las tablas de scoring no tienen tournament_id, así que
 * el scope viene del loader (bracketIds/groupIds/categoryIds) y se filtra
 * client-side; sin esto, cada punto anotado en cualquier torneo de la
 * plataforma refrescaba la página de todos los espectadores (audit 2026-07-01).
 */
export function TorneoPlayerRealtime({
  tournamentId,
  scope,
}: {
  tournamentId: string;
  scope: TorneoRealtimeScope;
}) {
  const bracketSet = new Set(scope.bracketIds);
  const categorySet = new Set(scope.categoryIds);
  const groupSet = new Set(scope.groupIds);

  useScopedRealtimeRefresh(
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
    {
      enabled: !!tournamentId,
      debounceMs: REALTIME_DEBOUNCE.LIVE,
      isRelevant: (table, payload) => {
        if (table === "bracket_matches") {
          const bid = payloadId(payload, "bracket_id");
          return bid == null ? true : bracketSet.has(bid);
        }
        if (table === "tournament_group_matches" || table === "tournament_group_members") {
          const gid = payloadId(payload, "group_id");
          return gid == null ? true : groupSet.has(gid);
        }
        if (table === "tournament_groups") {
          const cid = payloadId(payload, "category_id");
          return cid == null ? true : categorySet.has(cid);
        }
        return true;
      },
    },
  );
  return null;
}
