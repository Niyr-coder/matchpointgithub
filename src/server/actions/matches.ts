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
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { IsoDateTimeSchema, MpSportSchema, UuidSchema } from "@/lib/schemas/common";
import { getPlanForUser } from "@/lib/auth/plan";

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
  score: MatchScore | null;
  reportedBy: string | null;
  reportedAt: string | null;
  confirmedBy: string[];
  confirmedAt: string | null;
  disputedReason: string | null;
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
  score: MatchScore | null;
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
    isRanked: row.is_ranked === true,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    // Premium gate: solo matches creados por usuarios Premium cuentan para
    // ranking (is_ranked=true). Free crea matches casuales (is_ranked=false)
    // que quedan en historial pero no disparan el recálculo ELO. El opponent
    // se beneficia del rating si el creador es Premium, sin importar su plan.
    const creatorPlan = await getPlanForUser(baseSupabase, userId);
    const isRanked = creatorPlan.tier === "premium";

    const supabase = await getMatchesClient();
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
      } as never)
      .select("*")
      .single();
    if (error || !row) {
      throw new MpError("MATCH.CREATE_FAILED", error?.message ?? "No se pudo crear el partido", 500);
    }
    return rowToMatch(row as DbMatch);
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

    if (row.status !== "scheduled" && row.status !== "reported") {
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

    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from("matches")
      .update({
        score,
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
