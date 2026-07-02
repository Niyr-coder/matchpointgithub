import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getTournament } from "@/server/actions/tournaments";
import type { MyRegistration, TournamentInscrito } from "@/components/dashboard/eventos/TournamentDetailView";
import type { TournamentDetail } from "@/lib/schemas/tournaments";

import {
  loadTournamentPlayerBracketData,
  type TournamentBracketSideView,
  type TournamentPlayerGroupView,
  type TournamentPlayerMatchView,
} from "@/lib/torneos/player-matches";
import { loadTournamentScheduleBlocks } from "@/server/queries/tournament-schedule";
import type { TournamentScheduleBlockView } from "@/lib/tournaments/schedule-display";

export type TournamentDashboardPageData = {
  detail: TournamentDetail;
  clubName: string | null;
  clubCity: string | null;
  myRegistration: MyRegistration | null;
  inscritos: TournamentInscrito[];
  meUserId: string | null;
  categoryRegistrationCounts: Record<string, number>;
  scheduleBlocks: TournamentScheduleBlockView[];
  myMatches: TournamentPlayerMatchView[];
  bracketSides: TournamentBracketSideView[];
  groupView: TournamentPlayerGroupView | null;
};

export async function loadTournamentDashboardPageData(
  idOrSlug: string,
): Promise<TournamentDashboardPageData | null> {
  const detailRes = await getTournament({ idOrSlug });
  if (!detailRes.ok) return null;

  const sess = await getSession();
  const supabase = await getServerClient();

  // Club de la sede: 1 fila puntual de la vista pública (antes se traían 24
  // torneos con listFeaturedTournaments solo para extraer este dato).
  const { data: summaryRow } = await supabase
    .from("tournaments_public_summary")
    .select("club_name,club_city")
    .eq("id", detailRes.data.tournament.id)
    .maybeSingle();
  const summary = summaryRow
    ? {
        clubName: (summaryRow.club_name as string | null) ?? null,
        clubCity: (summaryRow.club_city as string | null) ?? null,
      }
    : undefined;
  let myRegistration: MyRegistration | null = null;
  if (sess.authenticated) {
    const { data: regRow } = await supabase
      .from("registrations")
      .select("id,status,category_id")
      .eq("tournament_id", detailRes.data.tournament.id)
      .contains("player_ids", [sess.session.userId])
      .not("status", "in", "(withdrawn,rejected,cancelled)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (regRow) {
      myRegistration = {
        id: regRow.id as string,
        status: regRow.status as string,
        categoryId: (regRow.category_id as string | null) ?? null,
      };
    }
  }

  const { data: regsRaw } = await supabase
    .from("registrations")
    .select("id,player_ids,category_id,created_at")
    .eq("tournament_id", detailRes.data.tournament.id)
    // Waitlist no aparece en la lista pública de inscritos.
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: true })
    .limit(64);

  const categoryRegistrationCounts: Record<string, number> = {};
  for (const r of regsRaw ?? []) {
    const cid = r.category_id as string | null;
    if (cid) categoryRegistrationCounts[cid] = (categoryRegistrationCounts[cid] ?? 0) + 1;
  }

  const allIds = new Set<string>();
  for (const r of regsRaw ?? []) {
    for (const p of (r.player_ids as string[] | null) ?? []) allIds.add(p);
  }
  const profById = new Map<string, { displayName: string; avatarUrl: string | null; city: string | null }>();
  if (allIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url,city")
      .in("id", Array.from(allIds));
    for (const p of profs ?? []) {
      profById.set(p.id as string, {
        displayName: (p.display_name as string | null) ?? "Sin nombre",
        avatarUrl: (p.avatar_url as string | null) ?? null,
        city: (p.city as string | null) ?? null,
      });
    }
  }

  const inscritos: TournamentInscrito[] = (regsRaw ?? []).flatMap((r) =>
    ((r.player_ids as string[] | null) ?? []).map((pid) => {
      const p = profById.get(pid);
      return {
        userId: pid,
        displayName: p?.displayName ?? "Sin nombre",
        avatarUrl: p?.avatarUrl ?? null,
        city: p?.city ?? null,
        registeredAt: r.created_at as string,
      };
    }),
  );

  const bracketData = await loadTournamentPlayerBracketData(
    supabase,
    detailRes.data.tournament.id,
    myRegistration?.id ?? null,
    myRegistration?.categoryId ?? null,
  );
  const scheduleBlocks = await loadTournamentScheduleBlocks(detailRes.data.tournament.id);

  return {
    detail: detailRes.data,
    clubName: summary?.clubName ?? null,
    clubCity: summary?.clubCity ?? null,
    myRegistration,
    inscritos,
    meUserId: sess.authenticated ? sess.session.userId : null,
    categoryRegistrationCounts,
    scheduleBlocks,
    myMatches: bracketData.myMatches,
    bracketSides: bracketData.bracketSides,
    groupView: bracketData.groupView,
  };
}
