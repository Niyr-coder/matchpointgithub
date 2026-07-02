import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { getSession } from "@/lib/auth/session";
import { getTournament } from "@/server/actions/tournaments";
import { getDerivedCategoryWinners } from "@/server/actions/tournament-close";
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
  /** Resumen del jugador cuando el torneo terminó: récord + delta de MPR + puesto de grupo. */
  myTournamentSummary: { wins: number; losses: number; deltaRating: number; rank: number | null } | null;
  /** Fase de MI categoría (multi-categoría: puede estar 'complete' con el torneo aún live). */
  myCategory: { name: string | null; stage: string | null; championLabel: string | null } | null;
  /** MPR del jugador (2.0-8.0) para el aviso de rango en el modal de categoría. */
  myMpr: number | null;
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

  // MPR propio para el aviso de rango del modal de categoría (escala /1000).
  // player_stats es por (user, sport, mode): usamos el modo de la modalidad
  // del torneo (singles → singles; doubles/mixed_doubles → doubles).
  let myMpr: number | null = null;
  if (sess.authenticated) {
    const mode = detailRes.data.tournament.modality === "singles" ? "singles" : "doubles";
    const { data: statRow } = await supabase
      .from("player_stats")
      .select("current_rating")
      .eq("user_id", sess.session.userId)
      .eq("sport", detailRes.data.tournament.sport)
      .eq("mode", mode)
      .maybeSingle();
    if (statRow?.current_rating != null) myMpr = (statRow.current_rating as number) / 1000;
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

  // Fase por categoría: en multi-categoría MI categoría puede terminar
  // ('complete') mientras el torneo global sigue live con otras en juego.
  let myCategory: TournamentDashboardPageData["myCategory"] = null;
  if (myRegistration?.categoryId) {
    const { data: catRow } = await supabase
      .from("tournament_categories")
      .select("name,stage")
      .eq("id", myRegistration.categoryId)
      .maybeSingle();
    if (catRow) {
      myCategory = {
        name: (catRow.name as string | null) ?? null,
        stage: (catRow.stage as string | null) ?? null,
        championLabel: null,
      };
    }
  }
  const myCategoryComplete = myCategory?.stage === "complete";
  if (myCategory && myCategoryComplete && myRegistration?.categoryId) {
    const winners = await getDerivedCategoryWinners(detailRes.data.tournament.id);
    myCategory.championLabel =
      winners.find((w) => w.categoryId === myRegistration.categoryId)?.winnerLabel ?? null;
  }

  // Resumen post-torneo (Fase C): récord + delta de MPR acumulado del torneo.
  // match_rating_applications es admin-only por RLS → admin client, filtrado
  // al propio usuario. Cuando el torneo terminó — o cuando MI categoría ya
  // está completa aunque el torneo global siga live (multi-categoría).
  let myTournamentSummary: TournamentDashboardPageData["myTournamentSummary"] = null;
  if (
    (detailRes.data.tournament.status === "finished" || myCategoryComplete) &&
    myRegistration &&
    sess.authenticated
  ) {
    const adminDb = getAdminClient();
    const tid = detailRes.data.tournament.id;
    const [{ data: bmIds }, { data: gmIds }] = await Promise.all([
      adminDb.from("bracket_matches").select("id").eq("tournament_id", tid),
      adminDb.from("tournament_group_matches").select("id").eq("tournament_id", tid),
    ]);
    const matchIds = [
      ...((bmIds ?? []) as Array<{ id: string }>).map((m) => m.id),
      ...((gmIds ?? []) as Array<{ id: string }>).map((m) => m.id),
    ];
    if (matchIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: apps } = await (adminDb as any)
        .from("match_rating_applications")
        .select("delta,won")
        .eq("user_id", sess.session.userId)
        .in("match_id", matchIds);
      const rows = (apps ?? []) as Array<{ delta: number; won: boolean }>;
      if (rows.length > 0) {
        const rank =
          bracketData.groupView?.standings.find((r) => r.involvesMe)?.rank ?? null;
        myTournamentSummary = {
          wins: rows.filter((r) => r.won).length,
          losses: rows.filter((r) => !r.won).length,
          deltaRating: rows.reduce((s, r) => s + (r.delta ?? 0), 0),
          rank,
        };
      }
    }
  }

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
    myTournamentSummary,
    myCategory,
    myMpr,
  };
}
