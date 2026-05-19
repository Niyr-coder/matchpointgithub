"use server";

// Ranking: read leaderboards + report match results. Rating recompute is
// expected to run nightly via pg_cron + a SECURITY DEFINER fn that updates
// player_stats and ranking_snapshots; here we just collect the inputs.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  MatchResultReportSchema,
  MatchResultSchema,
  RankingEntrySchema,
  RankingListParamsSchema,
  RankingSnapshotSchema,
  type MatchResult,
  type RankingEntry,
} from "@/lib/schemas/ranking";
import { UuidSchema, MpSportSchema } from "@/lib/schemas/common";

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

// ── getRanking (public) ────────────────────────────────────────────────
export async function getRanking(input: unknown): Promise<ActionResult<RankingEntry[]>> {
  return runAction(RankingListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    // Una sola query: PostgREST resuelve el embedded join via la FK
    // player_stats.user_id → profiles(id) declarada en 019_ranking.sql.
    // Antes hacíamos un select extra a profiles con `in("id", userIds)` (N+1).
    const { data: stats, error } = await supabase
      .from("player_stats")
      .select(
        "user_id,sport,mode,current_rating,wins,losses,matches_total,profiles!inner(display_name,username,avatar_url,city)",
      )
      .eq("sport", params.sport)
      .eq("mode", params.mode)
      .order("current_rating", { ascending: false })
      .range(from, to);
    if (error) throw new MpError("RANKING.DB_ERROR", error.message, 500);
    const rows = stats ?? [];
    if (rows.length === 0) return [];

    return rows.map((r, i) => {
      // El embed puede devolver objeto o array según cardinalidad detectada.
      // Para una FK to-one declarada en 019, PostgREST devuelve objeto, pero
      // normalizamos por defensa.
      const profileEmbed = (r as Record<string, unknown>).profiles as
        | { display_name?: string | null; username?: string | null; avatar_url?: string | null; city?: string | null }
        | { display_name?: string | null; username?: string | null; avatar_url?: string | null; city?: string | null }[]
        | null;
      const profile = Array.isArray(profileEmbed) ? profileEmbed[0] ?? null : profileEmbed;
      return RankingEntrySchema.parse({
        userId: r.user_id,
        displayName: (profile?.display_name as string | undefined) ?? "—",
        username: (profile?.username as string | null | undefined) ?? null,
        avatarUrl: (profile?.avatar_url as string | null | undefined) ?? null,
        city: (profile?.city as string | null | undefined) ?? null,
        sport: r.sport,
        mode: r.mode ?? "singles",
        rank: from + i + 1,
        currentRating: r.current_rating,
        wins: r.wins,
        losses: r.losses,
        matchesTotal: r.matches_total,
      });
    });
  });
}

// ── getUserRankingHistory ──────────────────────────────────────────────
const HistorySchema = z.object({
  userId: UuidSchema,
  sport: MpSportSchema,
  fromDate: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(365).default(90),
});

export async function getUserRankingHistory(
  input: unknown,
): Promise<ActionResult<z.infer<typeof RankingSnapshotSchema>[]>> {
  return runAction(HistorySchema, input, async ({ userId, sport, fromDate, limit }) => {
    const supabase = await getServerClient();
    let q = supabase
      .from("ranking_snapshots")
      .select("rating,rank_position,snapshot_at")
      .eq("user_id", userId)
      .eq("sport", sport)
      .order("snapshot_at", { ascending: false })
      .limit(limit);
    if (fromDate) q = q.gte("snapshot_at", fromDate);
    const { data, error } = await q;
    if (error) throw new MpError("RANKING.DB_ERROR", error.message, 500);
    return (data ?? []).map((r) =>
      RankingSnapshotSchema.parse({
        rating: r.rating,
        rankPosition: (r.rank_position as number | null) ?? null,
        snapshotAt: r.snapshot_at,
      }),
    );
  });
}

// ── submitMatchResult ──────────────────────────────────────────────────
export async function submitMatchResult(input: unknown): Promise<ActionResult<MatchResult>> {
  return runAction(MatchResultReportSchema, input, async (data) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const allPlayerIds = [...data.sideA, ...data.sideB].map((s) => s.userId);
    if (!allPlayerIds.includes(userId)) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only a match participant can submit the result");
    }
    if (data.sideA.length !== data.sideB.length) {
      throw new MpError("MATCH.SIDES_UNEVEN", "Both sides must have the same player count", 422);
    }

    const { data: row, error } = await supabase
      .from("match_results")
      .insert({
        sport: data.sport,
        played_at: data.playedAt,
        club_id: data.clubId ?? null,
        reservation_id: data.reservationId ?? null,
        side_a: data.sideA,
        side_b: data.sideB,
        winner_side: data.winnerSide,
        status: "reported",
        reported_by: userId,
      } as never)
      .select()
      .single();
    if (error) throw new MpError("MATCH.SUBMIT_FAILED", error.message, 500);
    return MatchResultSchema.parse({
      id: row.id,
      sport: row.sport,
      playedAt: row.played_at,
      clubId: (row.club_id as string | null) ?? null,
      reservationId: (row.reservation_id as string | null) ?? null,
      tournamentMatchId: (row.tournament_match_id as string | null) ?? null,
      sideA: row.side_a,
      sideB: row.side_b,
      winnerSide: row.winner_side,
      status: row.status,
      reportedBy: row.reported_by,
      confirmedBy: (row.confirmed_by as string | null) ?? null,
      confirmedAt: (row.confirmed_at as string | null) ?? null,
      disputedReason: (row.disputed_reason as string | null) ?? null,
      createdAt: row.created_at,
    });
  });
}

// ── confirmMatchResult (other participant) ─────────────────────────────
export async function confirmMatchResult(input: unknown): Promise<ActionResult<MatchResult>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("match_results")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !row) throw new MpError("MATCH.NOT_FOUND", "Match not found", 404);

    const isPlayer =
      ((row.side_a as { user_id?: string; userId?: string }[]) ?? []).some(
        (p) => p.user_id === userId || p.userId === userId,
      ) ||
      ((row.side_b as { user_id?: string; userId?: string }[]) ?? []).some(
        (p) => p.user_id === userId || p.userId === userId,
      );
    if (!isPlayer || row.reported_by === userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only another participant can confirm");
    }
    if (row.status !== "reported") {
      throw new MpError("MATCH.NOT_REPORTED", `Status is '${row.status}'`, 409);
    }

    const { data: updated, error: uErr } = await supabase
      .from("match_results")
      .update({
        status: "confirmed",
        confirmed_by: userId,
        confirmed_at: new Date().toISOString(),
      } as never)
      .eq("id", id)
      .select()
      .single();
    if (uErr) throw new MpError("MATCH.CONFIRM_FAILED", uErr.message, 500);

    return MatchResultSchema.parse({
      id: updated.id,
      sport: updated.sport,
      playedAt: updated.played_at,
      clubId: (updated.club_id as string | null) ?? null,
      reservationId: (updated.reservation_id as string | null) ?? null,
      tournamentMatchId: (updated.tournament_match_id as string | null) ?? null,
      sideA: updated.side_a,
      sideB: updated.side_b,
      winnerSide: updated.winner_side,
      status: updated.status,
      reportedBy: updated.reported_by,
      confirmedBy: updated.confirmed_by,
      confirmedAt: updated.confirmed_at,
      disputedReason: (updated.disputed_reason as string | null) ?? null,
      createdAt: updated.created_at,
    });
  });
}
