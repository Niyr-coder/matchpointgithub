"use server";

// Matches sueltos (casual/pickup) reportados por jugadores fuera de torneo.
// Ciclo de vida: scheduled → reported → confirmed | disputed.
//
// TODO(ranking): cuando un match llega a status='confirmed' hay que disparar el
// recálculo de ranking (player_stats + ranking_snapshots). La lógica de cálculo
// vive fuera de este archivo (ver ranking.ts y la fn SECURITY DEFINER del
// cron nocturno). Por ahora dejamos el match marcado como confirmed y el
// próximo job lo absorberá.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { IsoDateTimeSchema, MpSportSchema, UuidSchema } from "@/lib/schemas/common";
import { getPlanForUser } from "@/lib/auth/plan";
import { getProfileSummary } from "@/lib/auth/profile";
import {
  retarGradientForUserId,
  retarHeroWhoFromUser,
  retarInitialsFromName,
  retarLevelFromRating,
} from "@/lib/match/retar-hero-present";
import { listClubs } from "@/server/actions/clubs";
import { sendMessage } from "@/server/actions/messaging";
import { notify } from "@/server/notifications/dispatch";
import { cancelReservation, createReservation } from "@/server/actions/reservations";
import {
  readMatchPlannedMeta,
  type MatchPlannedMeta,
} from "@/lib/matches/planned-meta";

// Los tipos generados de Supabase (src/lib/db/types.ts) todavía no incluyen la
// tabla `matches` — esos tipos se regeneran cuando la migration 053 se aplica.
// Hasta entonces, accedemos a la tabla con un shim laxo. Cuando se regeneren
// los tipos, este helper deja de ser necesario y `supabase.from("matches")`
// queda tipado correctamente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

async function getMatchesClient(): Promise<LooseClient> {
  const supabase = await getServerClient();
  return supabase as unknown as LooseClient;
}

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión para continuar");
  return user.id;
}

// ── Schemas ──────────────────────────────────────────────────────────────
const MatchModeSchema = z.enum(["singles", "doubles"]);

const MatchScoreSchema = z.object({
  sets: z
    .array(z.object({ a: z.number().int().min(0), b: z.number().int().min(0) }))
    .min(1)
    .max(7),
  winner: z.enum(["a", "b"]),
});

type MatchScore = z.infer<typeof MatchScoreSchema>;

/** Metadata en `score` mientras el partido sigue en `scheduled` (sin sets reportados). */
type MatchPlannedScore = { planned: MatchPlannedMeta };
type MatchScorePayload = MatchScore | MatchPlannedScore;

const PlannedBestOfSchema = z.union([z.literal(1), z.literal(3), z.literal(5)]);

const CreateMatchSchema = z
  .object({
    sport: MpSportSchema,
    mode: MatchModeSchema,
    clubId: UuidSchema.nullable().optional(),
    courtId: UuidSchema.nullable().optional(),
    playedAt: IsoDateTimeSchema,
    durationMin: z.coerce.number().int().min(15).max(480).default(60),
    teamAPlayerIds: z.array(UuidSchema).min(1).max(2),
    teamBPlayerIds: z.array(UuidSchema).min(1).max(2),
    isRanked: z.boolean().optional().default(false),
    plannedBestOf: PlannedBestOfSchema.optional(),
    challengeMessage: z.string().trim().max(180).optional(),
    /** Si true, todos entran al chat de inmediato (p. ej. Busco partido). */
    skipChallengeAcceptance: z.boolean().optional().default(false),
  })
  .refine((d) => d.teamAPlayerIds.length === d.teamBPlayerIds.length, {
    message: "Los dos equipos deben tener el mismo número de jugadores",
    path: ["teamBPlayerIds"],
  })
  .refine(
    (d) =>
      (d.mode === "singles" && d.teamAPlayerIds.length === 1) ||
      (d.mode === "doubles" && d.teamAPlayerIds.length === 2),
    {
      message: "Singles requiere 1 jugador por equipo, doubles requiere 2",
      path: ["mode"],
    },
  )
  .refine(
    (d) => new Set([...d.teamAPlayerIds, ...d.teamBPlayerIds]).size ===
      d.teamAPlayerIds.length + d.teamBPlayerIds.length,
    {
      message: "Un jugador no puede estar en ambos equipos ni duplicado",
      path: ["teamBPlayerIds"],
    },
  );

const ReportScoreSchema = z.object({
  matchId: UuidSchema,
  score: MatchScoreSchema,
});

const ConfirmScoreSchema = z.object({ matchId: UuidSchema });

const DisputeScoreSchema = z.object({
  matchId: UuidSchema,
  reason: z.string().min(3).max(500),
});

const MatchChallengeIdSchema = z.object({ matchId: UuidSchema });

const DeclineMatchChallengeSchema = z.object({
  matchId: UuidSchema,
  reason: z.string().max(280).optional(),
});

const ListRecentSchema = z.object({
  userId: UuidSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Tipo de salida ───────────────────────────────────────────────────────
export type MatchRow = {
  id: string;
  sport: "tennis" | "padel" | "pickleball";
  mode: "singles" | "doubles";
  clubId: string | null;
  courtId: string | null;
  playedAt: string;
  durationMin: number;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  score: MatchScorePayload | null;
  reportedBy: string | null;
  reportedAt: string | null;
  confirmedBy: string[];
  confirmedAt: string | null;
  disputedReason: string | null;
  acceptedBy: string[];
  status: "scheduled" | "reported" | "confirmed" | "disputed" | "cancelled";
  isRanked: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type DbMatch = {
  id: string;
  sport: MatchRow["sport"];
  mode: MatchRow["mode"];
  club_id: string | null;
  court_id: string | null;
  played_at: string;
  duration_min: number;
  team_a_player_ids: string[];
  team_b_player_ids: string[];
  score: MatchScorePayload | null;
  reported_by: string | null;
  reported_at: string | null;
  confirmed_by: string[] | null;
  confirmed_at: string | null;
  disputed_reason: string | null;
  status: MatchRow["status"];
  is_ranked: boolean | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  accepted_by?: string[] | null;
};

function rowToMatch(row: DbMatch): MatchRow {
  return {
    id: row.id,
    sport: row.sport,
    mode: row.mode,
    clubId: row.club_id,
    courtId: row.court_id,
    playedAt: row.played_at,
    durationMin: row.duration_min,
    teamAPlayerIds: row.team_a_player_ids ?? [],
    teamBPlayerIds: row.team_b_player_ids ?? [],
    score: row.score,
    reportedBy: row.reported_by,
    reportedAt: row.reported_at,
    confirmedBy: row.confirmed_by ?? [],
    confirmedAt: row.confirmed_at,
    disputedReason: row.disputed_reason,
    status: row.status,
    acceptedBy: row.accepted_by ?? [],
    isRanked: row.is_ranked === true,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function allPlayerIds(row: Pick<DbMatch, "team_a_player_ids" | "team_b_player_ids">): string[] {
  return [...(row.team_a_player_ids ?? []), ...(row.team_b_player_ids ?? [])];
}

function isFullyAccepted(row: DbMatch): boolean {
  const pending = allPlayerIds(row).filter((id) => !(row.accepted_by ?? []).includes(id));
  return pending.length === 0;
}

function isReportedScore(score: MatchScorePayload | null): score is MatchScore {
  return !!score && typeof score === "object" && "sets" in score && Array.isArray((score as MatchScore).sets);
}

function validateScoreForBestOf(score: MatchScore, bestOf: 1 | 3 | 5 | undefined): void {
  const needed = bestOf ? Math.ceil(bestOf / 2) : 1;
  if (score.sets.length === 0 || score.sets.length > (bestOf ?? 7)) {
    throw new MpError("MATCH.INVALID_SCORE", "Cantidad de sets inválida para este formato", 422);
  }
  let winsA = 0;
  let winsB = 0;
  for (const set of score.sets) {
    if (set.a === set.b) {
      throw new MpError("MATCH.INVALID_SCORE", "Cada set debe tener un ganador", 422);
    }
    if (set.a > set.b) winsA += 1;
    else winsB += 1;
  }
  const winnerWins = score.winner === "a" ? winsA : winsB;
  const loserWins = score.winner === "a" ? winsB : winsA;
  if (winnerWins !== needed) {
    throw new MpError(
      "MATCH.INVALID_SCORE",
      bestOf && bestOf > 1
        ? `Para ganar al mejor de ${bestOf} necesitas ${needed} sets`
        : "El ganador debe tener el set a favor",
      422,
    );
  }
  if (winnerWins + loserWins > (bestOf ?? score.sets.length)) {
    throw new MpError("MATCH.INVALID_SCORE", "Hay sets de más para este formato", 422);
  }
}

function assertParticipant(
  userId: string,
  row: Pick<DbMatch, "team_a_player_ids" | "team_b_player_ids">,
): void {
  const all = [...(row.team_a_player_ids ?? []), ...(row.team_b_player_ids ?? [])];
  if (!all.includes(userId)) {
    throw new AuthError("AUTH.ROLE_REQUIRED", "Solo los participantes del partido pueden hacer esto");
  }
}

// ── createMatch ──────────────────────────────────────────────────────────
export async function createMatch(input: unknown): Promise<ActionResult<MatchRow>> {
  return runAction(CreateMatchSchema, input, async (data) => {
    const userId = await requireUserId();
    // El creador debe participar del partido (en algún equipo).
    const all = [...data.teamAPlayerIds, ...data.teamBPlayerIds];
    if (!all.includes(userId)) {
      throw new MpError(
        "MATCH.CREATOR_NOT_PARTICIPANT",
        "El creador debe estar en alguno de los dos equipos",
        422,
      );
    }
    const baseSupabase = await getServerClient();
    // Premium gate: is_ranked solo si el creador es Premium y pidió ranked.
    // Free siempre casual; el rival se beneficia del ELO si el match es ranked.
    const creatorPlan = await getPlanForUser(baseSupabase, userId);
    const isRanked = creatorPlan.tier === "premium" && data.isRanked === true;

    const supabase = await getMatchesClient();
    const plannedMeta: MatchPlannedMeta = {};
    if (data.plannedBestOf) plannedMeta.bestOf = data.plannedBestOf;

    if (data.clubId && data.courtId) {
      const startsAt = data.playedAt;
      const endsAt = new Date(
        new Date(startsAt).getTime() + data.durationMin * 60_000,
      ).toISOString();
      const rsvRes = await createReservation({
        clubId: data.clubId,
        courtId: data.courtId,
        startsAt,
        endsAt,
        sport: data.sport,
        visibility: "private",
        maxPlayers: data.mode === "doubles" ? 4 : 2,
        notes: "Reserva del reto MATCHPOINT",
      });
      if (!rsvRes.ok) {
        const code = rsvRes.error.code;
        if (code === "RESERVATION.SLOT_TAKEN") {
          throw new MpError(
            "MATCH.SLOT_TAKEN",
            "Ese horario ya está reservado. Elige otra hora o cancha.",
            409,
          );
        }
        throw new MpError(
          "MATCH.RESERVATION_FAILED",
          rsvRes.error.message,
          500,
        );
      }
      plannedMeta.reservationId = rsvRes.data.id;
    }

    const plannedScore: MatchPlannedScore | null =
      plannedMeta.bestOf || plannedMeta.reservationId ? { planned: plannedMeta } : null;

    const acceptedBy = data.skipChallengeAcceptance ? all : [userId];

    const { data: row, error } = await supabase
      .from("matches")
      .insert({
        sport: data.sport,
        mode: data.mode,
        club_id: data.clubId ?? null,
        court_id: data.courtId ?? null,
        played_at: data.playedAt,
        duration_min: data.durationMin,
        team_a_player_ids: data.teamAPlayerIds,
        team_b_player_ids: data.teamBPlayerIds,
        status: "scheduled",
        is_ranked: isRanked,
        created_by: userId,
        score: plannedScore,
        accepted_by: acceptedBy,
      } as never)
      .select("*")
      .single();
    if (error || !row) {
      throw new MpError("MATCH.CREATE_FAILED", error?.message ?? "No se pudo crear el partido", 500);
    }
    const match = rowToMatch(row as DbMatch);
    const conversationId = await findMatchConversationId(match.id);

    const challengeText = data.challengeMessage?.trim();
    if (challengeText && conversationId) {
      const msgRes = await sendMessage({
        id: conversationId,
        body: { body: challengeText, kind: "text" },
      });
      if (!msgRes.ok) {
        console.error("[createMatch] challenge message failed:", msgRes.error.message);
      }
    }

    if (plannedMeta.reservationId && conversationId && data.clubId && data.courtId) {
      const base = await getServerClient();
      const [{ data: clubRow }, { data: courtRow }] = await Promise.all([
        base.from("clubs").select("name,city").eq("id", data.clubId).maybeSingle(),
        base.from("courts").select("name,code").eq("id", data.courtId).maybeSingle(),
      ]);
      const courtName =
        (courtRow?.name as string | null)?.trim() ||
        `Cancha ${(courtRow?.code as string | undefined) ?? "?"}`;
      const endsAt = new Date(
        new Date(data.playedAt).getTime() + data.durationMin * 60_000,
      ).toISOString();
      const cardRes = await sendMessage({
        id: conversationId,
        body: {
          body: `Reserva confirmada · ${courtName}`,
          kind: "system",
          payload: {
            type: "court-reserved",
            reservationId: plannedMeta.reservationId,
            clubName: (clubRow?.name as string | undefined) ?? "Club",
            courtName,
            startsAt: data.playedAt,
            endsAt,
            matchId: match.id,
          },
        },
      });
      if (!cardRes.ok) {
        console.error("[createMatch] reservation card failed:", cardRes.error.message);
      }
    }

    if (!data.skipChallengeAcceptance) {
      const creator = await getProfileSummary(userId);
      const pendingIds = all.filter((id) => id !== userId);
      await Promise.all(
        pendingIds.map((uid) =>
          notify({
            userId: uid,
            role: "user",
            kind: "match_challenge_received",
            title: `${creator.displayName ?? "Un jugador"} te retó a un duelo`,
            body: "Acepta el reto para unirte al chat del partido y coordinar el encuentro.",
            payload: {
              match_id: match.id,
              challenger_name: creator.displayName ?? "Un jugador",
            },
          }),
        ),
      );
    }

    return match;
  });
}

// ── reportScore ──────────────────────────────────────────────────────────
// Permite re-reportar si nadie confirmó todavía (status='reported' sigue siendo
// editable mientras no haya confirmaciones de otros participantes — al
// re-reportar se reinicia confirmed_by al solo reporter).
export async function reportScore(input: unknown): Promise<ActionResult<MatchRow>> {
  return runAction(ReportScoreSchema, input, async ({ matchId, score }) => {
    const userId = await requireUserId();
    const supabase = await getMatchesClient();

    const { data: existing, error: selErr } = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();
    if (selErr || !existing) {
      throw new MpError("MATCH.NOT_FOUND", "Partido no encontrado", 404);
    }
    const row = existing as DbMatch;
    assertParticipant(userId, row);

    if (!isFullyAccepted(row)) {
      throw new MpError(
        "MATCH.NOT_ACCEPTED",
        "Todos los jugadores deben aceptar el reto antes de reportar el marcador",
        409,
      );
    }

    if (row.status !== "scheduled" && row.status !== "reported" && row.status !== "disputed") {
      throw new MpError(
        "MATCH.NOT_REPORTABLE",
        `No se puede reportar score en estado '${row.status}'`,
        409,
      );
    }

    // Política de seguridad: el reporter NO puede reportar solo contra sí mismo.
    // Si un usuario consta en ambos equipos (no debería pasar por el CHECK de
    // disjoint, pero defensa en profundidad) o si el equipo rival está vacío,
    // bloqueamos. El CHECK de teams_balanced ya garantiza simetría en insert.
    const isInA = (row.team_a_player_ids ?? []).includes(userId);
    const isInB = (row.team_b_player_ids ?? []).includes(userId);
    if (isInA && isInB) {
      throw new MpError(
        "MATCH.SELF_REPORT_FORBIDDEN",
        "No puedes reportar un partido en el que figuras en ambos equipos",
        422,
      );
    }

    const planned = readMatchPlannedMeta(row.score);
    validateScoreForBestOf(score, planned.bestOf);

    const nowIso = new Date().toISOString();
    const scorePayload =
      planned.bestOf || planned.reservationId ? { ...score, planned } : score;
    const { data: updated, error: updErr } = await supabase
      .from("matches")
      .update({
        score: scorePayload,
        reported_by: userId,
        reported_at: nowIso,
        status: "reported",
        confirmed_by: [userId],
        // disputed_reason se limpia al re-reportar.
        disputed_reason: null,
        confirmed_at: null,
      } as never)
      .eq("id", matchId)
      .select("*")
      .single();
    if (updErr || !updated) {
      throw new MpError("MATCH.REPORT_FAILED", updErr?.message ?? "No se pudo reportar", 500);
    }

    const conversationId = await findMatchConversationId(matchId);
    const reporter = await getProfileSummary(userId);
    const others = [...(row.team_a_player_ids ?? []), ...(row.team_b_player_ids ?? [])].filter(
      (id) => id !== userId,
    );
    const setsSummary = score.sets.map((s) => `${s.a}-${s.b}`).join(", ");
    const body = setsSummary
      ? `Marcador: ${setsSummary}. Confírmalo en el chat del partido.`
      : "Confirma el resultado en el chat del partido.";
    await Promise.all(
      others.map((uid) =>
        notify({
          userId: uid,
          role: "user",
          kind: "match_result_reported",
          title: `${reporter.displayName ?? "Un jugador"} reportó el resultado`,
          body,
          payload: {
            match_id: matchId,
            conversation_id: conversationId,
            reporter_name: reporter.displayName ?? "Un jugador",
            winner: score.winner,
            sets_summary: setsSummary || null,
          },
        }),
      ),
    );

    return rowToMatch(updated as DbMatch);
  });
}

// ── acceptMatchChallenge / declineMatchChallenge ───────────────────────────
export async function acceptMatchChallenge(
  input: unknown,
): Promise<ActionResult<{ conversationId: string | null; fullyAccepted: boolean }>> {
  return runAction(MatchChallengeIdSchema, input, async ({ matchId }) => {
    const userId = await requireUserId();
    const supabase = await getMatchesClient();
    const { data: existing, error: selErr } = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();
    if (selErr || !existing) throw new MpError("MATCH.NOT_FOUND", "Partido no encontrado", 404);
    const row = existing as DbMatch;
    if (row.status === "cancelled") {
      throw new MpError("MATCH.CHALLENGE_CLOSED", "Este reto ya no está disponible", 409);
    }
    assertParticipant(userId, row);

    const accepted = row.accepted_by ?? [];
    if (accepted.includes(userId)) {
      const conversationId = await findMatchConversationId(matchId);
      return { conversationId, fullyAccepted: isFullyAccepted(row) };
    }

    const nextAccepted = [...accepted, userId];
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "user");
    const conversationId = await findMatchConversationId(matchId);
    if (conversationId) {
      const { error: memberErr } = await admin.from("conversation_members").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: userId === row.created_by ? "admin" : "member",
      } as never);
      if (memberErr && memberErr.code !== "23505") {
        throw new MpError("MATCH.ACCEPT_FAILED", memberErr.message, 500);
      }
    }

    const { data: updated, error: updErr } = await supabase
      .from("matches")
      .update({ accepted_by: nextAccepted } as never)
      .eq("id", matchId)
      .select("*")
      .single();
    if (updErr || !updated) {
      throw new MpError("MATCH.ACCEPT_FAILED", updErr?.message ?? "No se pudo aceptar", 500);
    }
    const nextRow = updated as DbMatch;
    const fullyAccepted = isFullyAccepted(nextRow);
    const acceptor = await getProfileSummary(userId);

    const others = allPlayerIds(row).filter((id) => id !== userId);
    const pendingCount = allPlayerIds(nextRow).filter((id) => !(nextRow.accepted_by ?? []).includes(id)).length;
    await Promise.all(
      others.map((uid) =>
        notify({
          userId: uid,
          role: "user",
          kind: "match_challenge_accepted",
          title: `${acceptor.displayName ?? "Un jugador"} aceptó el reto`,
          body: fullyAccepted
            ? "Todos aceptaron. Ya pueden coordinar y registrar el marcador en el chat."
            : pendingCount > 0
              ? `Falta que ${pendingCount} jugador${pendingCount === 1 ? "" : "es"} acepte.`
              : "El duelo sigue en marcha.",
          payload: {
            match_id: matchId,
            conversation_id: conversationId,
            acceptor_name: acceptor.displayName ?? "Un jugador",
            pending_label: fullyAccepted ? null : `${pendingCount} pendiente(s)`,
          },
        }),
      ),
    );

    if (fullyAccepted && conversationId) {
      await sendMessage({
        id: conversationId,
        body: {
          body: "Todos aceptaron el reto. Cuando jueguen, registra el marcador aquí abajo.",
          kind: "system",
          payload: { type: "match-ready", matchId },
        },
      });
    }

    return { conversationId, fullyAccepted };
  });
}

export async function declineMatchChallenge(
  input: unknown,
): Promise<ActionResult<MatchRow>> {
  return runAction(DeclineMatchChallengeSchema, input, async ({ matchId, reason }) => {
    const userId = await requireUserId();
    const supabase = await getMatchesClient();
    const { data: existing, error: selErr } = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();
    if (selErr || !existing) throw new MpError("MATCH.NOT_FOUND", "Partido no encontrado", 404);
    const row = existing as DbMatch;
    assertParticipant(userId, row);
    if (row.status === "cancelled") return rowToMatch(row);
    if (isFullyAccepted(row)) {
      throw new MpError("MATCH.CHALLENGE_LOCKED", "El reto ya fue aceptado por todos", 409);
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from("matches")
      .update({
        status: "cancelled",
        cancelled_by: userId,
        cancelled_reason: reason ?? "Reto rechazado",
        cancelled_at: nowIso,
      } as never)
      .eq("id", matchId)
      .select("*")
      .single();
    if (updErr || !updated) {
      throw new MpError("MATCH.DECLINE_FAILED", updErr?.message ?? "No se pudo rechazar", 500);
    }

    const decliner = await getProfileSummary(userId);
    const conversationId = await findMatchConversationId(matchId);
    const others = allPlayerIds(row).filter((id) => id !== userId);
    await Promise.all(
      others.map((uid) =>
        notify({
          userId: uid,
          role: "user",
          kind: "match_cancelled",
          title: "Reto rechazado",
          body: `${decliner.displayName ?? "Un jugador"} rechazó el duelo${reason ? ` · ${reason}` : ""}.`,
          payload: {
            match_id: matchId,
            conversation_id: conversationId,
            canceller_name: decliner.displayName ?? "Un jugador",
            reason: reason ?? "Reto rechazado",
          },
        }),
      ),
    );

    return rowToMatch(updated as DbMatch);
  });
}

// ── confirmScore ─────────────────────────────────────────────────────────
export async function confirmScore(input: unknown): Promise<ActionResult<MatchRow>> {
  return runAction(ConfirmScoreSchema, input, async ({ matchId }) => {
    const userId = await requireUserId();
    const supabase = await getMatchesClient();

    const { data: existing, error: selErr } = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();
    if (selErr || !existing) {
      throw new MpError("MATCH.NOT_FOUND", "Partido no encontrado", 404);
    }
    const row = existing as DbMatch;
    assertParticipant(userId, row);

    if (row.status !== "reported") {
      throw new MpError(
        "MATCH.NOT_CONFIRMABLE",
        `Solo se puede confirmar un partido reportado (estado actual: '${row.status}')`,
        409,
      );
    }

    const totalPlayers =
      (row.team_a_player_ids ?? []).length + (row.team_b_player_ids ?? []).length;
    const current = new Set(row.confirmed_by ?? []);
    current.add(userId);
    const nextConfirmedBy = Array.from(current);
    const allConfirmed = nextConfirmedBy.length >= totalPlayers;
    const nowIso = new Date().toISOString();

    const { data: updated, error: updErr } = await supabase
      .from("matches")
      .update({
        confirmed_by: nextConfirmedBy,
        status: allConfirmed ? "confirmed" : "reported",
        confirmed_at: allConfirmed ? nowIso : null,
      } as never)
      .eq("id", matchId)
      .select("*")
      .single();
    if (updErr || !updated) {
      throw new MpError("MATCH.CONFIRM_FAILED", updErr?.message ?? "No se pudo confirmar", 500);
    }
    // TODO(ranking): si allConfirmed, encolar recálculo de player_stats.
    return rowToMatch(updated as DbMatch);
  });
}

// ── disputeScore ─────────────────────────────────────────────────────────
export async function disputeScore(input: unknown): Promise<ActionResult<MatchRow>> {
  return runAction(DisputeScoreSchema, input, async ({ matchId, reason }) => {
    const userId = await requireUserId();
    const supabase = await getMatchesClient();

    const { data: existing, error: selErr } = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();
    if (selErr || !existing) {
      throw new MpError("MATCH.NOT_FOUND", "Partido no encontrado", 404);
    }
    const row = existing as DbMatch;
    assertParticipant(userId, row);

    if (row.status !== "reported") {
      throw new MpError(
        "MATCH.NOT_DISPUTABLE",
        `Solo se puede disputar un partido reportado (estado actual: '${row.status}')`,
        409,
      );
    }

    const { data: updated, error: updErr } = await supabase
      .from("matches")
      .update({
        status: "disputed",
        disputed_reason: reason,
        confirmed_by: [],
        confirmed_at: null,
      } as never)
      .eq("id", matchId)
      .select("*")
      .single();
    if (updErr || !updated) {
      throw new MpError("MATCH.DISPUTE_FAILED", updErr?.message ?? "No se pudo disputar", 500);
    }
    return rowToMatch(updated as DbMatch);
  });
}

// ── listRecentMatchesForUser ─────────────────────────────────────────────
export async function listRecentMatchesForUser(
  input: unknown,
): Promise<ActionResult<MatchRow[]>> {
  return runAction(ListRecentSchema, input, async ({ userId, limit }) => {
    const supabase = await getMatchesClient();
    // Filtra por overlap en cualquiera de los dos arrays.
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .or(`team_a_player_ids.cs.{${userId}},team_b_player_ids.cs.{${userId}}`)
      .order("played_at", { ascending: false })
      .limit(limit);
    if (error) {
      throw new MpError("MATCH.LIST_FAILED", error.message, 500);
    }
    return ((data ?? []) as DbMatch[]).map((r) => rowToMatch(r));
  });
}

// ── Ciclo de vida post-aceptación: cancelar / reprogramar ──────────────────
// Ver docs/product/04-matches-lifecycle.md.
const CancelMatchSchema = z.object({
  matchId: UuidSchema,
  reason: z.string().max(280).optional(),
});

const RescheduleMatchSchema = z.object({
  matchId: UuidSchema,
  playedAt: IsoDateTimeSchema,
});

// Devuelve el conversation_id del chat del match (creado por trigger mig 118).
async function findMatchConversationId(matchId: string): Promise<string | null> {
  const supabase = await getMatchesClient();
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("match_id", matchId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// Encola una notif inapp a cada userId (best-effort, service role).
async function enqueueMatchNotif(
  recipientIds: string[],
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (recipientIds.length === 0) return;
  const admin = getAdminClient();
  const rows = recipientIds.map((uid) => ({
    user_id: uid,
    role: "user",
    kind,
    channel: "inapp",
    payload,
    status: "pending",
  }));
  const { error } = await admin.from("notification_jobs").insert(rows as never);
  if (error) console.error(`[${kind}] enqueue notif failed:`, error.message);
}

// ── cancelMatch ────────────────────────────────────────────────────────────
// Cancela un partido agendado. Notifica al resto de participantes y, si el
// match nació de un "Busco partido", reabre el aviso (si no expiró) para que
// el autor pueda elegir a otro postulante (que quedaron en pausa).
export async function cancelMatch(input: unknown): Promise<ActionResult<MatchRow>> {
  return runAction(CancelMatchSchema, input, async ({ matchId, reason }) => {
    const userId = await requireUserId();
    const supabase = await getMatchesClient();

    const { data: existing, error: selErr } = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();
    if (selErr || !existing) throw new MpError("MATCH.NOT_FOUND", "Partido no encontrado", 404);
    const row = existing as DbMatch;
    assertParticipant(userId, row);

    // Solo se puede cancelar antes de confirmarse (scheduled o reported).
    if (row.status !== "scheduled" && row.status !== "reported") {
      throw new MpError(
        "MATCH.NOT_CANCELLABLE",
        `No se puede cancelar un partido en estado '${row.status}'`,
        409,
      );
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from("matches")
      .update({
        status: "cancelled",
        cancelled_by: userId,
        cancelled_reason: reason ?? null,
        cancelled_at: nowIso,
      } as never)
      .eq("id", matchId)
      .select("*")
      .single();
    if (updErr || !updated) {
      throw new MpError("MATCH.CANCEL_FAILED", updErr?.message ?? "No se pudo cancelar", 500);
    }

    const linkedReservation = readMatchPlannedMeta(row.score).reservationId;
    if (linkedReservation) {
      const cancelRsv = await cancelReservation({
        id: linkedReservation,
        body: { reason: reason ?? "Partido cancelado" },
      });
      if (!cancelRsv.ok) {
        console.error("[cancelMatch] reservation cancel failed:", cancelRsv.error.message);
      }
    }

    const conversationId = await findMatchConversationId(matchId);
    const canceller = await getProfileSummary(userId);

    // Reabrir el aviso de origen (si vino de un match_seek y no expiró). El que
    // cancela puede NO ser el autor del seek → RLS de match_seeks bloquearía el
    // update; usamos service role con actor seteado para el audit.
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "system");
    // match_seeks* no están en los Database types generados → shim laxo.
    const adminLoose = admin as unknown as LooseClient;
    const { data: seekRow } = await adminLoose
      .from("match_seeks")
      .select("id,expires_at")
      .eq("match_id", matchId)
      .eq("status", "matched")
      .maybeSingle();
    const seek = seekRow as { id: string; expires_at: string } | null;
    if (seek && new Date(seek.expires_at).getTime() > Date.now()) {
      await adminLoose.from("match_seeks").update({ status: "open", match_id: null }).eq("id", seek.id);
      // La postulación aceptada se marca rejected (el pairing falló); el resto
      // sigue 'pending' y el autor puede elegir de nuevo.
      await adminLoose
        .from("match_seek_applications")
        .update({ status: "rejected", responded_at: nowIso })
        .eq("seek_id", seek.id)
        .eq("status", "accepted");
    }

    // Fiabilidad: cancelar un partido agendado cuenta como cancelación del que
    // cancela (penaliza leve el score; ver src/lib/reliability.ts). Best-effort.
    const { data: relRow } = await adminLoose
      .from("player_reliability")
      .select("cancellations")
      .eq("user_id", userId)
      .maybeSingle();
    if (relRow) {
      await adminLoose
        .from("player_reliability")
        .update({ cancellations: ((relRow as { cancellations: number }).cancellations ?? 0) + 1 })
        .eq("user_id", userId);
    } else {
      await adminLoose.from("player_reliability").insert({ user_id: userId, cancellations: 1 });
    }

    // Notif al resto de participantes.
    const others = [...(row.team_a_player_ids ?? []), ...(row.team_b_player_ids ?? [])].filter(
      (id) => id !== userId,
    );
    await enqueueMatchNotif(others, "match_cancelled", {
      match_id: matchId,
      conversation_id: conversationId,
      canceller_name: canceller.displayName ?? "El otro jugador",
      reason: reason ?? null,
    });

    return rowToMatch(updated as DbMatch);
  });
}

// ── reportNoShow (Stage 3 · gated por match_reliability_enabled) ───────────
const ReportNoShowSchema = z.object({
  matchId: UuidSchema,
  noShowUserId: UuidSchema,
});

async function reliabilityEnabled(): Promise<boolean> {
  const supabase = await getServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc("fn_my_effective_flags");
  return ((data ?? []) as { key: string; enabled: boolean }[]).some(
    (r) => r.key === "match_reliability_enabled" && r.enabled,
  );
}

export async function reportNoShow(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ReportNoShowSchema, input, async ({ matchId, noShowUserId }) => {
    if (!(await reliabilityEnabled())) {
      throw new MpError("MATCH.RELIABILITY_DISABLED", "El reporte de inasistencias no está disponible.", 403);
    }
    const userId = await requireUserId();
    if (noShowUserId === userId) {
      throw new MpError("MATCH.NO_SHOW_SELF", "No puedes reportarte a ti mismo", 422);
    }
    const supabase = await getMatchesClient();
    const { data: existing, error: selErr } = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();
    if (selErr || !existing) throw new MpError("MATCH.NOT_FOUND", "Partido no encontrado", 404);
    const row = existing as DbMatch;
    assertParticipant(userId, row);

    const allPlayers = [...(row.team_a_player_ids ?? []), ...(row.team_b_player_ids ?? [])];
    if (!allPlayers.includes(noShowUserId)) {
      throw new MpError("MATCH.NO_SHOW_NOT_PARTICIPANT", "Ese jugador no es del partido", 422);
    }
    if (row.status !== "scheduled" && row.status !== "reported") {
      throw new MpError("MATCH.NO_SHOW_BAD_STATUS", `No se puede reportar en estado '${row.status}'`, 409);
    }
    if (new Date(row.played_at).getTime() > Date.now()) {
      throw new MpError("MATCH.NO_SHOW_TOO_EARLY", "Solo puedes reportar después de la hora del partido", 409);
    }

    // Insert + contador vía service role (RLS de match_no_shows = admin-only;
    // la identidad de participante ya está validada).
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "system");
    // match_no_shows / player_reliability no están en los Database types → loose.
    const adminLoose = admin as unknown as LooseClient;
    const { error: insErr } = await adminLoose
      .from("match_no_shows")
      .insert({ match_id: matchId, reported_by: userId, no_show_user_id: noShowUserId });
    if (insErr) {
      if (insErr.code === "23505") {
        throw new MpError("MATCH.NO_SHOW_DUPLICATE", "Ya reportaste esta inasistencia", 409);
      }
      throw new MpError("MATCH.NO_SHOW_FAILED", insErr.message, 500);
    }
    // Upsert del contador del jugador reportado.
    const { data: relRow } = await adminLoose
      .from("player_reliability")
      .select("no_shows")
      .eq("user_id", noShowUserId)
      .maybeSingle();
    if (relRow) {
      await adminLoose
        .from("player_reliability")
        .update({ no_shows: ((relRow as { no_shows: number }).no_shows ?? 0) + 1 })
        .eq("user_id", noShowUserId);
    } else {
      await adminLoose
        .from("player_reliability")
        .insert({ user_id: noShowUserId, no_shows: 1 });
    }

    const conversationId = await findMatchConversationId(matchId);
    const reporter = await getProfileSummary(userId);
    await enqueueMatchNotif([noShowUserId], "match_no_show_reported", {
      match_id: matchId,
      conversation_id: conversationId,
      reporter_name: reporter.displayName ?? "Un jugador",
    });

    return { ok: true as const };
  });
}

// ── rescheduleMatch ────────────────────────────────────────────────────────
export async function rescheduleMatch(input: unknown): Promise<ActionResult<MatchRow>> {
  return runAction(RescheduleMatchSchema, input, async ({ matchId, playedAt }) => {
    const userId = await requireUserId();
    if (new Date(playedAt).getTime() <= Date.now()) {
      throw new MpError("MATCH.RESCHEDULE_PAST", "La nueva fecha debe ser futura", 422);
    }
    const supabase = await getMatchesClient();

    const { data: existing, error: selErr } = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();
    if (selErr || !existing) throw new MpError("MATCH.NOT_FOUND", "Partido no encontrado", 404);
    const row = existing as DbMatch;
    assertParticipant(userId, row);
    if (row.status !== "scheduled") {
      throw new MpError(
        "MATCH.NOT_RESCHEDULABLE",
        `Solo se puede reprogramar un partido agendado (estado: '${row.status}')`,
        409,
      );
    }

    const linkedReservation = readMatchPlannedMeta(row.score).reservationId;
    if (linkedReservation) {
      const endsAt = new Date(
        new Date(playedAt).getTime() + row.duration_min * 60_000,
      ).toISOString();
      const range = `[${playedAt},${endsAt})`;
      const base = await getServerClient();
      const { error: rsvErr } = await base
        .from("reservations")
        .update({ during: range } as never)
        .eq("id", linkedReservation)
        .eq("organizer_id", userId);
      if (rsvErr) {
        if (rsvErr.code === "23P01") {
          throw new MpError(
            "MATCH.SLOT_TAKEN",
            "Ese horario ya está ocupado. Elige otra hora.",
            409,
          );
        }
        throw new MpError("MATCH.RESERVATION_RESCHEDULE_FAILED", rsvErr.message, 500);
      }
    }

    const { data: updated, error: updErr } = await supabase
      .from("matches")
      .update({ played_at: playedAt } as never)
      .eq("id", matchId)
      .select("*")
      .single();
    if (updErr || !updated) {
      throw new MpError("MATCH.RESCHEDULE_FAILED", updErr?.message ?? "No se pudo reprogramar", 500);
    }

    const conversationId = await findMatchConversationId(matchId);
    const rescheduler = await getProfileSummary(userId);
    const others = [...(row.team_a_player_ids ?? []), ...(row.team_b_player_ids ?? [])].filter(
      (id) => id !== userId,
    );
    await enqueueMatchNotif(others, "match_rescheduled", {
      match_id: matchId,
      conversation_id: conversationId,
      rescheduler_name: rescheduler.displayName ?? "El otro jugador",
      played_at: playedAt,
    });

    return rowToMatch(updated as DbMatch);
  });
}

// ── RetarModal hero (perfil + H2H) ─────────────────────────────────────────
const STARTING_RATING = 2500;
const SPORT_PRIMARY = "pickleball" as const;

const AV_GRADIENTS = [
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
];

const GetMatchConversationSchema = z.object({ matchId: UuidSchema });

export async function getMatchConversationId(
  input: unknown,
): Promise<ActionResult<{ conversationId: string }>> {
  return runAction(GetMatchConversationSchema, input, async ({ matchId }) => {
    await requireUserId();
    const conversationId = await findMatchConversationId(matchId);
    if (!conversationId) {
      throw new MpError("MATCH.CHAT_NOT_FOUND", "Chat del partido no disponible", 404);
    }
    return { conversationId };
  });
}

const GetRetarScheduleSchema = z.object({
  sport: MpSportSchema.default("pickleball"),
});

export type RetarScheduleClubOption = {
  id: string;
  name: string;
  city: string;
};

export type RetarScheduleOptions = {
  userCity: string | null;
  clubs: RetarScheduleClubOption[];
};

export async function getRetarScheduleOptions(
  input: unknown,
): Promise<ActionResult<RetarScheduleOptions>> {
  return runAction(GetRetarScheduleSchema, input, async ({ sport }) => {
    const userId = await requireUserId();
    const profile = await getProfileSummary(userId);

    const load = async (city?: string) => {
      const res = await listClubs({ sport, city, page: 1, pageSize: 40 });
      return res.ok ? res.data : [];
    };

    let clubs = profile.city ? await load(profile.city) : await load();
    if (clubs.length === 0 && profile.city) {
      clubs = await load();
    }

    return {
      userCity: profile.city,
      clubs: clubs.map((c) => ({ id: c.id, name: c.name, city: c.city })),
    };
  });
}

const GetRetarHeroSchema = z.object({
  opponentId: UuidSchema.optional(),
});

export type RetarHeroPlayer = {
  name: string;
  level: number;
  av: string;
  avBg: string;
  avatarUrl: string | null;
};

export type RetarHeroH2h = {
  youWins: number;
  rivalWins: number;
  total: number;
  streak: string | null;
};

export type ProfileScoutH2hMatch = {
  date: string;
  score: string;
  result: "W" | "L";
  venue: string;
};

export type ProfileScoutCommonRival = {
  name: string;
  initials: string;
  tone: string;
  mineRecord: string;
  theirRecord: string;
  edge: "you" | "they" | "even";
};

export type ProfileScoutMatchup = {
  myWinPct: number;
  theirWinPct: number;
  confidence: "baja" | "media" | "alta";
  expectedDelta: { ifWin: string; ifLose: string };
};

export type ProfileScoutPayload = {
  h2hMatches: ProfileScoutH2hMatch[];
  commonRivals: ProfileScoutCommonRival[];
  matchup: ProfileScoutMatchup;
};

export type RetarHeroContext = {
  me: RetarHeroPlayer;
  opponent: RetarHeroPlayer | null;
  h2h: RetarHeroH2h;
  scout: ProfileScoutPayload | null;
};

function gradientForUserId(id: string): string {
  return retarGradientForUserId(id);
}

function initialsFromName(name: string): string {
  return retarInitialsFromName(name);
}

function levelFromRating(elo: number | null | undefined): number {
  return retarLevelFromRating(elo);
}

function winnerFromScore(score: unknown): "a" | "b" | null {
  if (!score || typeof score !== "object") return null;
  const winner = (score as { winner?: unknown }).winner;
  return winner === "a" || winner === "b" ? winner : null;
}

type RawH2hMatch = {
  played_at: string;
  team_a_player_ids: string[] | null;
  team_b_player_ids: string[] | null;
  score: unknown;
  clubs?: { name?: string } | null;
};

const SCOUT_MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function fmtScoutMatchDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")} ${SCOUT_MONTHS_SHORT[d.getMonth()]}`;
}

function scoreTextFromRaw(score: unknown, onTeamA: boolean): string {
  if (!score || typeof score !== "object") return "—";
  const sets = (score as { sets?: unknown }).sets;
  if (!Array.isArray(sets) || sets.length === 0) return "—";
  return sets
    .map((s) => {
      if (!Array.isArray(s) || s.length < 2) return "—";
      const a = Number(s[0]);
      const b = Number(s[1]);
      return onTeamA ? `${a}-${b}` : `${b}-${a}`;
    })
    .join(", ");
}

function isHeadToHeadMatch(
  match: RawH2hMatch,
  userId: string,
  opponentId: string,
): boolean {
  const teamA = match.team_a_player_ids ?? [];
  const teamB = match.team_b_player_ids ?? [];
  const meOnA = teamA.includes(userId);
  const meOnB = teamB.includes(userId);
  if (!meOnA && !meOnB) return false;
  const oppOnA = teamA.includes(opponentId);
  const oppOnB = teamB.includes(opponentId);
  if (!oppOnA && !oppOnB) return false;
  return !((meOnA && oppOnA) || (meOnB && oppOnB));
}

function buildH2hMatchRows(
  matches: RawH2hMatch[],
  userId: string,
  opponentId: string,
  limit = 5,
): ProfileScoutH2hMatch[] {
  const rows: ProfileScoutH2hMatch[] = [];
  for (const match of matches) {
    if (!isHeadToHeadMatch(match, userId, opponentId)) continue;
    const teamA = match.team_a_player_ids ?? [];
    const meOnA = teamA.includes(userId);
    const winner = winnerFromScore(match.score);
    if (!winner) continue;
    const myTeam = meOnA ? "a" : "b";
    const iWon = winner === myTeam;
    rows.push({
      date: fmtScoutMatchDate(match.played_at),
      score: scoreTextFromRaw(match.score, meOnA),
      result: iWon ? "W" : "L",
      venue: match.clubs?.name ? `${match.clubs.name}` : "Sin club",
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

type OppRecord = { wins: number; losses: number };

function buildOpponentRecords(matches: RawH2hMatch[], userId: string): Map<string, OppRecord> {
  const map = new Map<string, OppRecord>();
  for (const match of matches) {
    const teamA = match.team_a_player_ids ?? [];
    const teamB = match.team_b_player_ids ?? [];
    const meOnA = teamA.includes(userId);
    const meOnB = teamB.includes(userId);
    if (!meOnA && !meOnB) continue;
    const opps = meOnA ? teamB : teamA;
    const winner = winnerFromScore(match.score);
    if (!winner) continue;
    const myTeam = meOnA ? "a" : "b";
    const iWon = winner === myTeam;
    for (const oppId of opps) {
      if (oppId === userId) continue;
      const item = map.get(oppId) ?? { wins: 0, losses: 0 };
      if (iWon) item.wins += 1;
      else item.losses += 1;
      map.set(oppId, item);
    }
  }
  return map;
}

function recordLabel(r: OppRecord): string {
  return `${r.wins}-${r.losses}`;
}

function recordEdge(mine: OppRecord, theirs: OppRecord): "you" | "they" | "even" {
  const mTotal = mine.wins + mine.losses;
  const tTotal = theirs.wins + theirs.losses;
  const mPct = mTotal > 0 ? mine.wins / mTotal : 0.5;
  const tPct = tTotal > 0 ? theirs.wins / tTotal : 0.5;
  if (mPct - tPct >= 0.12) return "you";
  if (tPct - mPct >= 0.12) return "they";
  return "even";
}

function estimateScoutMatchup(
  meLevel: number,
  oppLevel: number,
  h2h: RetarHeroH2h,
): ProfileScoutMatchup {
  const diff = meLevel - oppLevel;
  let myPct = 50 + diff * 12;
  if (h2h.total > 0) {
    const hist = (h2h.youWins / h2h.total) * 100;
    myPct = h2h.total >= 3 ? 0.5 * myPct + 0.5 * hist : 0.65 * myPct + 0.35 * hist;
  }
  myPct = Math.round(Math.max(12, Math.min(88, myPct)));
  const confidence: ProfileScoutMatchup["confidence"] =
    h2h.total >= 5 ? "alta" : h2h.total >= 2 ? "media" : "baja";
  const deltaWin = Math.min(0.12, Math.max(0.03, 0.06 + diff * 0.02));
  const deltaLose = Math.max(-0.1, Math.min(-0.02, -0.04 + diff * 0.01));
  return {
    myWinPct: myPct,
    theirWinPct: 100 - myPct,
    confidence,
    expectedDelta: {
      ifWin: `+${deltaWin.toFixed(2)}`,
      ifLose: deltaLose.toFixed(2),
    },
  };
}

async function buildProfileScoutPayload(
  supabase: Awaited<ReturnType<typeof getMatchesClient>>,
  viewerMatches: RawH2hMatch[],
  targetMatches: RawH2hMatch[],
  viewerId: string,
  targetId: string,
  me: RetarHeroPlayer,
  opponent: RetarHeroPlayer,
  h2h: RetarHeroH2h,
): Promise<ProfileScoutPayload> {
  const viewerMap = buildOpponentRecords(viewerMatches, viewerId);
  const targetMap = buildOpponentRecords(targetMatches, targetId);
  const commonIds = [...viewerMap.keys()].filter(
    (id) => id !== targetId && targetMap.has(id),
  );
  commonIds.sort((a, b) => {
    const aSum =
      (viewerMap.get(a)!.wins + viewerMap.get(a)!.losses) +
      (targetMap.get(a)!.wins + targetMap.get(a)!.losses);
    const bSum =
      (viewerMap.get(b)!.wins + viewerMap.get(b)!.losses) +
      (targetMap.get(b)!.wins + targetMap.get(b)!.losses);
    return bSum - aSum;
  });

  const topIds = commonIds.slice(0, 5);
  const profiles =
    topIds.length > 0
      ? (
          await supabase
            .from("profiles")
            .select("id,display_name")
            .in("id", topIds)
        ).data ?? []
      : [];
  const nameById = new Map<string, string>();
  for (const p of profiles) {
    nameById.set(p.id as string, (p.display_name as string | null) ?? "Jugador");
  }

  const commonRivals: ProfileScoutCommonRival[] = topIds.map((id) => {
    const mine = viewerMap.get(id)!;
    const theirs = targetMap.get(id)!;
    const name = nameById.get(id) ?? "Jugador";
    return {
      name,
      initials: initialsFromName(name),
      tone: gradientForUserId(id),
      mineRecord: recordLabel(mine),
      theirRecord: recordLabel(theirs),
      edge: recordEdge(mine, theirs),
    };
  });

  return {
    h2hMatches: buildH2hMatchRows(viewerMatches, viewerId, targetId),
    commonRivals,
    matchup: estimateScoutMatchup(me.level, opponent.level, h2h),
  };
}

function computeH2h(
  matches: RawH2hMatch[],
  userId: string,
  opponentId: string,
): RetarHeroH2h {
  let youWins = 0;
  let rivalWins = 0;
  let streakCount = 0;
  let streakKind: "win" | "loss" | null = null;

  for (const match of matches) {
    const teamA = match.team_a_player_ids ?? [];
    const teamB = match.team_b_player_ids ?? [];
    const meOnA = teamA.includes(userId);
    const meOnB = teamB.includes(userId);
    if (!meOnA && !meOnB) continue;

    const oppOnA = teamA.includes(opponentId);
    const oppOnB = teamB.includes(opponentId);
    if (!oppOnA && !oppOnB) continue;

    const sameTeam = (meOnA && oppOnA) || (meOnB && oppOnB);
    if (sameTeam) continue;

    const winner = winnerFromScore(match.score);
    if (!winner) continue;

    const myTeam = meOnA ? "a" : "b";
    const iWon = winner === myTeam;
    if (iWon) youWins += 1;
    else rivalWins += 1;

    const outcome: "win" | "loss" = iWon ? "win" : "loss";
    if (streakKind === null) {
      streakKind = outcome;
      streakCount = 1;
    } else if (streakKind === outcome) {
      streakCount += 1;
    } else {
      break;
    }
  }

  const total = youWins + rivalWins;
  let streak: string | null = null;
  if (total > 0 && streakKind === "win" && streakCount >= 1) {
    streak =
      streakCount === 1 ? "1 victoria seguida" : `${streakCount} victorias seguidas`;
  }

  return { youWins, rivalWins, total, streak };
}

function playerFromProfile(
  id: string,
  displayName: string | null,
  avatarUrl: string | null,
  rating: number | null | undefined,
  username?: string | null,
): RetarHeroPlayer {
  const who = retarHeroWhoFromUser(id, displayName, username, rating);
  return { ...who, avatarUrl };
}

export async function getRetarHeroContext(
  input: unknown,
): Promise<ActionResult<RetarHeroContext>> {
  return runAction(GetRetarHeroSchema, input, async ({ opponentId }) => {
    const userId = await requireUserId();
    const supabase = await getMatchesClient();

    const [meSummary, myStatRow, oppSummary, oppStatRow] = await Promise.all([
      getProfileSummary(userId),
      supabase
        .from("player_stats")
        .select("current_rating")
        .eq("user_id", userId)
        .eq("sport", SPORT_PRIMARY)
        .maybeSingle(),
      opponentId
        ? getProfileSummary(opponentId)
        : Promise.resolve(null),
      opponentId
        ? supabase
            .from("player_stats")
            .select("current_rating")
            .eq("user_id", opponentId)
            .eq("sport", SPORT_PRIMARY)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const me = playerFromProfile(
      userId,
      meSummary.displayName,
      meSummary.avatarUrl,
      (myStatRow.data as { current_rating?: number } | null)?.current_rating,
      meSummary.username,
    );

    const opponent =
      opponentId && oppSummary
        ? playerFromProfile(
            opponentId,
            oppSummary.displayName,
            oppSummary.avatarUrl,
            (oppStatRow.data as { current_rating?: number } | null)?.current_rating,
            oppSummary.username,
          )
        : null;

    const emptyH2h: RetarHeroH2h = {
      youWins: 0,
      rivalWins: 0,
      total: 0,
      streak: null,
    };

    if (!opponentId) {
      return { me, opponent, h2h: emptyH2h, scout: null };
    }

    const matchSelect =
      "played_at,team_a_player_ids,team_b_player_ids,score,clubs(name)";

    const [{ data: rawMatches, error }, { data: targetRawMatches, error: targetError }] =
      await Promise.all([
        supabase
          .from("matches")
          .select(matchSelect)
          .eq("status", "confirmed")
          .or(`team_a_player_ids.cs.{${userId}},team_b_player_ids.cs.{${userId}}`)
          .order("played_at", { ascending: false })
          .limit(200),
        supabase
          .from("matches")
          .select(matchSelect)
          .eq("status", "confirmed")
          .or(`team_a_player_ids.cs.{${opponentId}},team_b_player_ids.cs.{${opponentId}}`)
          .order("played_at", { ascending: false })
          .limit(200),
      ]);

    if (error) {
      throw new MpError("MATCH.H2H_FAILED", error.message, 500);
    }
    if (targetError) {
      throw new MpError("MATCH.SCOUT_FAILED", targetError.message, 500);
    }

    const viewerMatches = (rawMatches ?? []) as RawH2hMatch[];
    const targetMatches = (targetRawMatches ?? []) as RawH2hMatch[];
    const h2h = computeH2h(viewerMatches, userId, opponentId);
    const scout =
      opponent
        ? await buildProfileScoutPayload(
            supabase,
            viewerMatches,
            targetMatches,
            userId,
            opponentId,
            me,
            opponent,
            h2h,
          )
        : null;

    return { me, opponent, h2h, scout };
  });
}
