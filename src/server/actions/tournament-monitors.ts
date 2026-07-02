"use server";

import "server-only";

import { z } from "zod";
import { getAdminClient, setAuditActor, auditActorRole } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireUserId } from "@/lib/auth/session";
import { UuidSchema, SlugSchema } from "@/lib/schemas/common";
import { notifyClubStaff, notifyPartnerOrgStaff } from "@/lib/notifications/helpers";
import { notifyMatchReady, notifyTournamentFinishedCore } from "@/lib/notifications/tournament";
import { requireTournamentEditor } from "@/server/actions/tournaments";

// ── Tipos exportados ─────────────────────────────────────────────────────────

export type MatchType = "bracket" | "group";

export type CourtMonitorAssignment = {
  id: string;
  tournamentId: string;
  courtId: string;
  courtCode: string | null;
  courtName: string | null;
  userId: string;
  displayName: string;
  username: string;
  positionLabel: string | null;
  assignedAt: string;
};

export type MonitorCurrentMatch = {
  matchId: string;
  matchType: MatchType;
  teamA: string;
  teamB: string;
  /** Mismo formato que bracket_matches.score: {sets:[{a,b},...], serving?:'a'|'b'} */
  score: unknown;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  matchScoringConfig: ScoringConfig;
};

export type MonitorContext = {
  tournamentId: string;
  tournamentName: string;
  courtId: string;
  courtCode: string | null;
  courtName: string | null;
  positionLabel: string | null;
  monitorDisplayName: string;
  currentMatch: MonitorCurrentMatch | null;
  scoringConfig: ScoringConfig;
};

export type SetScore = { a: number; b: number };
/** `current` = puntos del set en curso (aún no completado). Se limpia al enviar el resultado. */
export type MatchScore = { sets: SetScore[]; serving?: "a" | "b"; current?: SetScore };

export type ScoringConfig = {
  points: number; // e.g. 11, 15, 21
  winBy: number;  // siempre 2 en pickleball
  bestOf: number; // 1, 3 o 5
};

// ── Helpers de autorización ───────────────────────────────────────────────────

type AnyClient = ReturnType<typeof getAdminClient>;

async function requireMonitorsEnabled(): Promise<void> {
  const supabase = await getServerClient();
  const { data } = await supabase.rpc("fn_my_effective_flags");
  const flag = (data ?? []).find(
    (r: { key: string; enabled: boolean }) => r.key === "tournament_monitors_enabled",
  );
  if (!flag?.enabled) {
    throw new MpError("MONITORS.DISABLED", "El sistema de monitores no está habilitado", 403);
  }
}


async function requireMonitorAssignment(
  userId: string,
  tournamentId: string,
  admin: AnyClient,
): Promise<Array<{ id: string; court_id: string; position_label: string | null }>> {
  const { data } = await admin
    .from("tournament_court_monitors")
    .select("id, court_id, position_label")
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(2);
  const rows = (data ?? []) as Array<{ id: string; court_id: string; position_label: string | null }>;
  if (rows.length === 0) {
    throw new AuthError("AUTH.ROLE_REQUIRED", "No tienes una cancha asignada en este torneo");
  }
  return rows;
}

/**
 * Índice determinístico de la cancha entre las canchas con monitor activo del
 * torneo. Se usa como offset en los fallbacks de "partido sin cancha" para que
 * dos monitores no vean el mismo partido; el claim atómico de startMatch cubre
 * la carrera residual.
 */
async function monitorCourtOffset(
  admin: AnyClient,
  tournamentId: string,
  courtId: string,
): Promise<number> {
  const { data } = await admin
    .from("tournament_court_monitors")
    .select("court_id")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true)
    .order("court_id", { ascending: true });
  const courts = Array.from(
    new Set(((data ?? []) as Array<{ court_id: string }>).map((r) => r.court_id)),
  );
  const idx = courts.indexOf(courtId);
  return idx < 0 ? 0 : idx;
}

/**
 * Verifica que el partido pertenezca a una de las canchas asignadas del
 * monitor. Sin esto, un monitor de la cancha A podría escribir el marcador
 * de un partido de la cancha B del mismo torneo.
 */
async function requireMatchOnMyCourt(
  admin: AnyClient,
  table: "bracket_matches" | "tournament_group_matches",
  matchId: string,
  assignments: Array<{ id: string; court_id: string; position_label: string | null }>,
): Promise<{ court_id: string | null; status: string }> {
  const { data } = await admin
    .from(table)
    .select("court_id, status")
    .eq("id", matchId)
    .maybeSingle();
  if (!data) {
    throw new MpError("MONITORS.MATCH_NOT_FOUND", "Partido no encontrado", 404);
  }
  const matchCourtId = data.court_id as string | null;
  const myCourtIds = assignments.map((a) => a.court_id);
  if (!matchCourtId || !myCourtIds.includes(matchCourtId)) {
    throw new MpError("MONITORS.MATCH_NOT_YOURS", "Este partido no pertenece a tu cancha", 403);
  }
  return { court_id: matchCourtId, status: data.status as string };
}

// ── Helper: resolver scoring config según si el partido es la final ───────────

async function resolveMatchScoringConfig(
  admin: AnyClient,
  matchType: MatchType,
  bracketId: string | null,
  round: number | null,
  isBronze: boolean,
  defaultConfig: ScoringConfig,
): Promise<ScoringConfig> {
  if (matchType !== "bracket" || !bracketId || round === null) return defaultConfig;

  const { data: bracket } = await admin
    .from("brackets")
    .select("category_id, size")
    .eq("id", bracketId)
    .maybeSingle();
  if (!bracket?.category_id || !bracket?.size) return defaultConfig;

  const numRounds = Math.log2(bracket.size as number);
  if (isBronze || round < numRounds) return defaultConfig;

  const { data: cat } = await admin
    .from("tournament_categories")
    .select("group_playoff_config")
    .eq("id", bracket.category_id as string)
    .maybeSingle();

  const gc = cat?.group_playoff_config as { finalScoringOverride?: { points?: number; winBy?: number; bestOf?: number } | null } | null;
  const ov = gc?.finalScoringOverride ?? null;
  if (!ov) return defaultConfig;

  return {
    points: ov.points ?? defaultConfig.points,
    winBy: ov.winBy ?? defaultConfig.winBy,
    bestOf: ov.bestOf ?? defaultConfig.bestOf,
  };
}

// ── 1. Asignar monitor a una cancha ─────────────────────────────────────────

const AssignMonitorSchema = z.object({
  tournamentId: UuidSchema,
  courtId: UuidSchema,
  userId: UuidSchema,
  positionLabel: z.string().max(60).optional(),
});

export async function assignCourtMonitor(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(AssignMonitorSchema, input, async ({ tournamentId, courtId, userId, positionLabel }) => {
    await requireMonitorsEnabled();
    const { userId: callerId, actorRole } = await requireTournamentEditor(tournamentId);
    const admin: AnyClient = getAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new MpError("MONITORS.USER_NOT_FOUND", "Usuario no encontrado", 404);

    const { data: court } = await admin
      .from("courts")
      .select("id")
      .eq("id", courtId)
      .maybeSingle();
    if (!court) throw new MpError("MONITORS.COURT_NOT_FOUND", "Cancha no encontrada", 404);

    const { data: existing } = await admin
      .from("tournament_court_monitors")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("court_id", courtId)
      .eq("is_active", true)
      .maybeSingle();
    if (existing) throw new MpError("MONITORS.COURT_TAKEN", "Esta cancha ya tiene un monitor asignado", 409);

    const { data: userCourts } = await admin
      .from("tournament_court_monitors")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("user_id", userId)
      .eq("is_active", true);
    if ((userCourts ?? []).length >= 2) {
      throw new MpError("MONITORS.MAX_COURTS_REACHED", "Un monitor puede tener máximo 2 canchas por torneo", 422);
    }

    await setAuditActor(admin, callerId, auditActorRole(actorRole));

    const { data: row, error } = await admin
      .from("tournament_court_monitors")
      .insert({
        tournament_id: tournamentId,
        court_id: courtId,
        user_id: userId,
        position_label: positionLabel ?? null,
        assigned_by: callerId,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) throw new MpError("MONITORS.ASSIGN_FAILED", "Error al asignar el monitor", 500);

    return { id: (row as { id: string }).id };
  });
}

// ── 2. Remover monitor de una cancha ─────────────────────────────────────────

const RemoveMonitorSchema = z.object({ monitorId: UuidSchema });

export async function removeCourtMonitor(input: unknown): Promise<ActionResult<void>> {
  return runAction(RemoveMonitorSchema, input, async ({ monitorId }) => {
    await requireMonitorsEnabled();
    const admin: AnyClient = getAdminClient();

    const { data: row } = await admin
      .from("tournament_court_monitors")
      .select("id, tournament_id")
      .eq("id", monitorId)
      .maybeSingle();
    if (!row) throw new MpError("MONITORS.NOT_FOUND", "Asignación no encontrada", 404);

    const { userId: callerId, actorRole } = await requireTournamentEditor(row.tournament_id as string);
    await setAuditActor(admin, callerId, auditActorRole(actorRole));

    await admin
      .from("tournament_court_monitors")
      .update({ is_active: false })
      .eq("id", monitorId);
  });
}

// ── 3. Obtener contexto del monitor (server component) ───────────────────────

const MonitorContextSchema = z.object({ slug: SlugSchema });

export async function getMonitorContext(
  input: unknown,
): Promise<ActionResult<MonitorContext>> {
  return runAction(MonitorContextSchema, input, async ({ slug }) => {
    await requireMonitorsEnabled();
    const userId = await requireUserId();
    const admin: AnyClient = getAdminClient();

    const { data: t } = await admin
      .from("tournaments")
      .select("id, name, scoring_config")
      .eq("slug", slug)
      .maybeSingle();
    if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);
    const tournamentId = t.id as string;

    const rawSc0 = (t.scoring_config as { points?: number; winBy?: number; bestOf?: number } | null) ?? null;
    const defaultScoringConfig: ScoringConfig = {
      points: rawSc0?.points ?? 11,
      winBy: rawSc0?.winBy ?? 2,
      bestOf: rawSc0?.bestOf ?? 3,
    };

    const assignments = await requireMonitorAssignment(userId, tournamentId, admin);
    const assignment = assignments[0];

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();

    const { data: court } = await admin
      .from("courts")
      .select("id, code, name")
      .eq("id", assignment.court_id)
      .maybeSingle();

    const nameByReg = await buildRegLabels(admin, tournamentId);

    // Auto-asignar: primer partido scheduled o live en la cancha del monitor.
    // Prioridad: bracket_matches primero, luego tournament_group_matches.
    let currentMatch: MonitorCurrentMatch | null = null;

    const { data: bmRaw } = await admin
      .from("bracket_matches")
      .select("id, bracket_id, round, is_bronze, side_a_registration_id, side_b_registration_id, score, status, scheduled_at, started_at")
      .eq("court_id", assignment.court_id)
      .in("status", ["scheduled", "live"])
      .order("scheduled_at", { ascending: true })
      .limit(1);

    const bm = (bmRaw ?? []) as unknown as Array<{
      id: string;
      bracket_id: string | null;
      round: number | null;
      is_bronze: boolean | null;
      side_a_registration_id: string | null;
      side_b_registration_id: string | null;
      score: unknown;
      status: string;
      scheduled_at: string | null;
      started_at: string | null;
    }>;

    if (bm.length > 0) {
      const m = bm[0];
      currentMatch = {
        matchId: m.id,
        matchType: "bracket",
        teamA: nameByReg.get(m.side_a_registration_id ?? "") ?? "Equipo A",
        teamB: nameByReg.get(m.side_b_registration_id ?? "") ?? "Equipo B",
        score: m.score,
        status: m.status,
        scheduledAt: m.scheduled_at,
        startedAt: m.started_at,
        matchScoringConfig: await resolveMatchScoringConfig(admin, "bracket", m.bracket_id ?? null, m.round ?? null, (m.is_bronze as boolean | null) ?? false, defaultScoringConfig),
      };
    } else {
      const { data: gmRaw } = await admin
        .from("tournament_group_matches")
        .select(
          "id, side_a_registration_id, side_b_registration_id, score, status, scheduled_at, started_at",
        )
        .eq("court_id", assignment.court_id)
        .in("status", ["scheduled", "live"])
        .order("scheduled_at", { ascending: true })
        .limit(1);

      const gm = (gmRaw ?? []) as unknown as Array<{
        id: string;
        side_a_registration_id: string;
        side_b_registration_id: string;
        score: unknown;
        status: string;
        scheduled_at: string | null;
        started_at: string | null;
      }>;

      if (gm.length > 0) {
        const m = gm[0];
        currentMatch = {
          matchId: m.id,
          matchType: "group",
          teamA: nameByReg.get(m.side_a_registration_id) ?? "Equipo A",
          teamB: nameByReg.get(m.side_b_registration_id) ?? "Equipo B",
          score: m.score,
          status: m.status,
          scheduledAt: m.scheduled_at,
          startedAt: m.started_at,
          matchScoringConfig: defaultScoringConfig,
        };
      }
    }

    // Fallback: partidos programados sin cancha asignada aún (habitual cuando no
    // hay programación por cancha). Solo 'scheduled' con court_id null — nunca
    // partidos ya tomados por otra cancha. El offset por cancha reparte los
    // partidos entre monitores; el claim atómico de startMatch cubre la carrera.
    if (!currentMatch) {
      const offset = await monitorCourtOffset(admin, tournamentId, assignment.court_id);

      // Intentar con bracket_matches por tournament_id (denormalizado): cubre
      // TODOS los brackets del torneo. Antes se tomaba solo el bracket más
      // reciente (.limit(1)) y los partidos sin cancha de las demás categorías
      // nunca llegaban a la cola de los monitores.
      {
        const fetchFbBm = (from: number) =>
          admin
            .from("bracket_matches")
            .select("id, bracket_id, round, is_bronze, side_a_registration_id, side_b_registration_id, score, status, scheduled_at, started_at")
            .eq("tournament_id", tournamentId)
            .is("court_id", null)
            .eq("status", "scheduled")
            .order("scheduled_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from);
        let { data: fbBmRaw } = await fetchFbBm(offset);
        if ((fbBmRaw ?? []).length === 0 && offset > 0) {
          ({ data: fbBmRaw } = await fetchFbBm(0));
        }
        const fbBm = (fbBmRaw ?? []) as unknown as Array<{ id: string; bracket_id: string | null; round: number | null; is_bronze: boolean | null; side_a_registration_id: string | null; side_b_registration_id: string | null; score: unknown; status: string; scheduled_at: string | null; started_at: string | null }>;
        if (fbBm.length > 0) {
          const m = fbBm[0];
          currentMatch = { matchId: m.id, matchType: "bracket", teamA: nameByReg.get(m.side_a_registration_id ?? "") ?? "Equipo A", teamB: nameByReg.get(m.side_b_registration_id ?? "") ?? "Equipo B", score: m.score, status: m.status, scheduledAt: m.scheduled_at, startedAt: m.started_at, matchScoringConfig: await resolveMatchScoringConfig(admin, "bracket", m.bracket_id ?? null, m.round ?? null, (m.is_bronze as boolean | null) ?? false, defaultScoringConfig) };
        }
      }

      // Intentar con tournament_categories → tournament_groups → tournament_group_matches
      if (!currentMatch) {
        const { data: catsRaw } = await admin
          .from("tournament_categories")
          .select("id")
          .eq("tournament_id", tournamentId);
        const catIds = ((catsRaw ?? []) as Array<{ id: string }>).map((c) => c.id);
        if (catIds.length > 0) {
          const { data: grpsRaw } = await admin
            .from("tournament_groups")
            .select("id")
            .in("category_id", catIds);
          const groupIds = ((grpsRaw ?? []) as Array<{ id: string }>).map((g) => g.id);
          if (groupIds.length > 0) {
            const fetchFbGm = (from: number) =>
              admin
                .from("tournament_group_matches")
                .select("id, side_a_registration_id, side_b_registration_id, score, status, scheduled_at, started_at")
                .in("group_id", groupIds)
                .is("court_id", null)
                .eq("status", "scheduled")
                .order("scheduled_at", { ascending: true })
                .order("id", { ascending: true })
                .range(from, from);
            let { data: fbGmRaw } = await fetchFbGm(offset);
            if ((fbGmRaw ?? []).length === 0 && offset > 0) {
              ({ data: fbGmRaw } = await fetchFbGm(0));
            }
            const fbGm = (fbGmRaw ?? []) as unknown as Array<{ id: string; side_a_registration_id: string; side_b_registration_id: string; score: unknown; status: string; scheduled_at: string | null; started_at: string | null }>;
            if (fbGm.length > 0) {
              const m = fbGm[0];
              currentMatch = { matchId: m.id, matchType: "group", teamA: nameByReg.get(m.side_a_registration_id) ?? "Equipo A", teamB: nameByReg.get(m.side_b_registration_id) ?? "Equipo B", score: m.score, status: m.status, scheduledAt: m.scheduled_at, startedAt: m.started_at, matchScoringConfig: defaultScoringConfig };
            }
          }
        }
      }
    }

    return {
      tournamentId,
      tournamentName: t.name as string,
      courtId: assignment.court_id,
      courtCode: (court?.code as string | null) ?? null,
      courtName: (court?.name as string | null) ?? null,
      positionLabel: assignment.position_label,
      monitorDisplayName: (profile?.display_name as string | null) ?? "Monitor",
      currentMatch,
      scoringConfig: defaultScoringConfig,
    };
  });
}

// ── 4. Iniciar partido ───────────────────────────────────────────────────────

const StartMatchSchema = z.object({
  matchId: UuidSchema,
  matchType: z.enum(["bracket", "group"]),
  servingFirst: z.enum(["a", "b"]),
  slug: SlugSchema,
});

export async function startMatch(input: unknown): Promise<ActionResult<void>> {
  return runAction(StartMatchSchema, input, async ({ matchId, matchType, servingFirst, slug }) => {
    await requireMonitorsEnabled();
    const userId = await requireUserId();
    const admin: AnyClient = getAdminClient();

    const { data: t } = await admin.from("tournaments").select("id,status").eq("slug", slug).maybeSingle();
    if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);
    const tournamentId = t.id as string;

    const assignments = await requireMonitorAssignment(userId, tournamentId, admin);
    const courtId = assignments[0].court_id;

    const table = matchType === "bracket" ? "bracket_matches" : "tournament_group_matches";

    // Guard: no reiniciar un partido ya en curso o reportado
    const { data: existing } = await admin
      .from(table)
      .select("status, court_id")
      .eq("id", matchId)
      .maybeSingle();
    if (!existing) {
      throw new MpError("MONITORS.MATCH_NOT_FOUND", "Partido no encontrado", 404);
    }
    if (existing.status === "reported") {
      throw new MpError("MONITORS.MATCH_ALREADY_REPORTED", "Este partido ya fue reportado", 409);
    }
    if (existing.status === "live") {
      // Ya en vivo en esta cancha — no resetear, simplemente OK
      if ((existing.court_id as string | null) === courtId) return;
      throw new MpError("MONITORS.MATCH_TAKEN", "Otra cancha ya tomó este partido", 409);
    }

    await setAuditActor(admin, userId, "user");

    const score: MatchScore = { sets: [], serving: servingFirst };
    // Claim atómico: solo si el partido sigue scheduled y sin cancha ajena.
    // Evita que dos monitores arranquen el mismo partido a la vez.
    const { data: claimed } = await admin
      .from(table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: "live", score, started_at: new Date().toISOString(), court_id: courtId } as any)
      .eq("id", matchId)
      .eq("status", "scheduled")
      .or(`court_id.is.null,court_id.eq.${courtId}`)
      .select("id");
    if (!claimed || claimed.length === 0) {
      throw new MpError("MONITORS.MATCH_TAKEN", "Otra cancha ya tomó este partido", 409);
    }

    // Auto-levantar el torneo a 'live' si aún está en inscripciones
    const tStatus = t.status as string;
    if (tStatus === "registration_open" || tStatus === "registration_closed") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await admin.from("tournaments").update({ status: "live" } as any).eq("id", tournamentId);
    }
  });
}

// ── 5. Actualizar score de set completado ────────────────────────────────────

const UpdateScoreSchema = z.object({
  matchId: UuidSchema,
  matchType: z.enum(["bracket", "group"]),
  score: z.object({
    // sets puede ir vacío cuando solo se persisten puntos del set en curso.
    sets: z.array(z.object({ a: z.number().int().min(0), b: z.number().int().min(0) })),
    serving: z.enum(["a", "b"]).optional(),
    current: z.object({ a: z.number().int().min(0), b: z.number().int().min(0) }).optional(),
  }),
  slug: SlugSchema,
});

export async function updateMatchScore(input: unknown): Promise<ActionResult<void>> {
  return runAction(UpdateScoreSchema, input, async ({ matchId, matchType, score, slug }) => {
    await requireMonitorsEnabled();
    const userId = await requireUserId();
    const admin: AnyClient = getAdminClient();

    const { data: t } = await admin.from("tournaments").select("id").eq("slug", slug).maybeSingle();
    if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

    const assignments = await requireMonitorAssignment(userId, t.id as string, admin);
    const table = matchType === "bracket" ? "bracket_matches" : "tournament_group_matches";
    const match = await requireMatchOnMyCourt(admin, table, matchId, assignments);
    if (match.status !== "live") {
      // Un persist rezagado no debe pisar un resultado ya enviado/confirmado.
      throw new MpError("MONITORS.MATCH_ALREADY_REPORTED", "Este partido ya fue reportado", 409);
    }

    await setAuditActor(admin, userId, "user");
    await admin.from(table).update({ score }).eq("id", matchId);
  });
}

// ── 6. Enviar resultado final ────────────────────────────────────────────────

const SubmitResultSchema = z.object({
  matchId: UuidSchema,
  matchType: z.enum(["bracket", "group"]),
  score: z.object({
    sets: z.array(z.object({ a: z.number().int().min(0), b: z.number().int().min(0) })).min(1),
  }),
  winnerSide: z.enum(["a", "b"]),
  durationMs: z.number().int().nonnegative().optional(),
  slug: SlugSchema,
});

export async function submitMatchResult(input: unknown): Promise<ActionResult<void>> {
  return runAction(SubmitResultSchema, input, async ({ matchId, matchType, score, winnerSide, durationMs, slug }) => {
    await requireMonitorsEnabled();
    const userId = await requireUserId();
    const admin: AnyClient = getAdminClient();

    const { data: t } = await admin.from("tournaments").select("id").eq("slug", slug).maybeSingle();
    if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

    const assignments = await requireMonitorAssignment(userId, t.id as string, admin);
    const table = matchType === "bracket" ? "bracket_matches" : "tournament_group_matches";
    const match = await requireMatchOnMyCourt(admin, table, matchId, assignments);
    if (match.status === "reported" || match.status === "confirmed" || match.status === "walkover") {
      throw new MpError("MONITORS.MATCH_ALREADY_REPORTED", "Este partido ya fue reportado", 409);
    }

    await setAuditActor(admin, userId, "user");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await admin.from(table).update({
      status: "reported",
      score,
      winner_side: winnerSide,
      duration_ms: durationMs ?? null,
    } as any).eq("id", matchId);
  });
}

// ── 7. Listar monitores asignados (panel partner) ────────────────────────────

const ListMonitorsSchema = z.object({ tournamentId: UuidSchema });

export async function listCourtMonitors(
  input: unknown,
): Promise<ActionResult<CourtMonitorAssignment[]>> {
  return runAction(ListMonitorsSchema, input, async ({ tournamentId }) => {
    await requireMonitorsEnabled();
    await requireTournamentEditor(tournamentId);
    const admin: AnyClient = getAdminClient();

    const { data } = await admin
      .from("tournament_court_monitors")
      .select(
        "id, court_id, user_id, position_label, created_at, courts(code, name), profiles!tournament_court_monitors_user_id_fkey(display_name, username)",
      )
      .eq("tournament_id", tournamentId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const court = row.courts as { code?: string; name?: string } | null;
      const profile = row.profiles as { display_name?: string; username?: string } | null;
      return {
        id: row.id as string,
        tournamentId,
        courtId: row.court_id as string,
        courtCode: court?.code ?? null,
        courtName: court?.name ?? null,
        userId: row.user_id as string,
        displayName: profile?.display_name ?? profile?.username ?? "Usuario",
        username: profile?.username ?? "",
        positionLabel: (row.position_label as string | null) ?? null,
        assignedAt: row.created_at as string,
      };
    });
  });
}

// ── 8. Resolver usuario por username (panel de asignación) ───────────────────

const ResolveUserSchema = z.object({ username: z.string().min(3).max(24) });

export async function resolveUserByUsername(
  input: unknown,
): Promise<ActionResult<{ id: string; displayName: string; username: string } | null>> {
  return runAction(ResolveUserSchema, input, async ({ username }) => {
    const admin: AnyClient = getAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, display_name, username")
      .ilike("username", username)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      displayName: (data.display_name as string) ?? (data.username as string),
      username: data.username as string,
    };
  });
}

const SearchUsersSchema = z.object({ query: z.string().min(2).max(50) });

export async function searchUsersByUsername(
  input: unknown,
): Promise<ActionResult<Array<{ id: string; displayName: string; username: string }>>> {
  return runAction(SearchUsersSchema, input, async ({ query }) => {
    const admin: AnyClient = getAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, display_name, username")
      .ilike("username", `${query}%`)
      .limit(8);
    return (data ?? []).map((u) => ({
      id: u.id as string,
      displayName: (u.display_name as string) ?? (u.username as string),
      username: u.username as string,
    }));
  });
}

// ── 9. Siguiente partido programado en la cancha del monitor ─────────────────

const GetNextMatchSchema = z.object({ slug: SlugSchema });

export async function getNextMatchForCourt(
  input: unknown,
): Promise<ActionResult<MonitorCurrentMatch | null>> {
  return runAction(GetNextMatchSchema, input, async ({ slug }) => {
    await requireMonitorsEnabled();
    const userId = await requireUserId();
    const admin: AnyClient = getAdminClient();

    const { data: t } = await admin
      .from("tournaments")
      .select("id, scoring_config")
      .eq("slug", slug)
      .maybeSingle();
    if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);
    const tournamentId = t.id as string;

    const rawScN = (t.scoring_config as { points?: number; winBy?: number; bestOf?: number } | null) ?? null;
    const defaultScoringConfig: ScoringConfig = {
      points: rawScN?.points ?? 11,
      winBy: rawScN?.winBy ?? 2,
      bestOf: rawScN?.bestOf ?? 3,
    };

    const assignments = await requireMonitorAssignment(userId, tournamentId, admin);
    const courtId = assignments[0].court_id;

    const nameByReg = await buildRegLabels(admin, tournamentId);

    // Buscar primero en bracket_matches
    const { data: bmRaw } = await admin
      .from("bracket_matches")
      .select("id, bracket_id, round, is_bronze, side_a_registration_id, side_b_registration_id, score, status, scheduled_at, started_at")
      .eq("court_id", courtId)
      .eq("status", "scheduled")
      .order("scheduled_at", { ascending: true })
      .limit(1);

    const bm = (bmRaw ?? []) as unknown as Array<{
      id: string;
      bracket_id: string | null;
      round: number | null;
      is_bronze: boolean | null;
      side_a_registration_id: string | null;
      side_b_registration_id: string | null;
      score: unknown;
      status: string;
      scheduled_at: string | null;
      started_at: string | null;
    }>;

    if (bm.length > 0) {
      const m = bm[0];
      return {
        matchId: m.id,
        matchType: "bracket" as MatchType,
        teamA: nameByReg.get(m.side_a_registration_id ?? "") ?? "Equipo A",
        teamB: nameByReg.get(m.side_b_registration_id ?? "") ?? "Equipo B",
        score: m.score,
        status: m.status,
        scheduledAt: m.scheduled_at,
        startedAt: m.started_at,
        matchScoringConfig: await resolveMatchScoringConfig(admin, "bracket", m.bracket_id ?? null, m.round ?? null, (m.is_bronze as boolean | null) ?? false, defaultScoringConfig),
      };
    }

    // Si no hay en bracket, buscar en tournament_group_matches
    const { data: gmRaw } = await admin
      .from("tournament_group_matches")
      .select("id, side_a_registration_id, side_b_registration_id, score, status, scheduled_at, started_at")
      .eq("court_id", courtId)
      .eq("status", "scheduled")
      .order("scheduled_at", { ascending: true })
      .limit(1);

    const gm = (gmRaw ?? []) as unknown as Array<{
      id: string;
      side_a_registration_id: string;
      side_b_registration_id: string;
      score: unknown;
      status: string;
      scheduled_at: string | null;
      started_at: string | null;
    }>;

    if (gm.length > 0) {
      const m = gm[0];
      return {
        matchId: m.id,
        matchType: "group" as MatchType,
        teamA: nameByReg.get(m.side_a_registration_id) ?? "Equipo A",
        teamB: nameByReg.get(m.side_b_registration_id) ?? "Equipo B",
        score: m.score,
        status: m.status,
        scheduledAt: m.scheduled_at,
        startedAt: m.started_at,
        matchScoringConfig: defaultScoringConfig,
      };
    }

    // Fallback: partidos programados sin cancha asignada aún (bracket primero).
    // Aplica cuando los partidos no fueron pre-programados por cancha.
    // El offset por cancha reparte los partidos entre monitores; al iniciarse,
    // startMatch escribirá court_id y los "reclamará" atómicamente.
    const fbOffset = await monitorCourtOffset(admin, tournamentId, courtId);

    // Por tournament_id (denormalizado): cubre TODOS los brackets del torneo,
    // no solo el generado más recientemente (bug multi-categoría).
    {
      const fetchFbBm = (from: number) =>
        admin
          .from("bracket_matches")
          .select("id, bracket_id, round, is_bronze, side_a_registration_id, side_b_registration_id, score, status, scheduled_at, started_at")
          .eq("tournament_id", tournamentId)
          .is("court_id", null)
          .eq("status", "scheduled")
          .order("scheduled_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from);
      let { data: fbBmRaw } = await fetchFbBm(fbOffset);
      if ((fbBmRaw ?? []).length === 0 && fbOffset > 0) {
        ({ data: fbBmRaw } = await fetchFbBm(0));
      }
      const fbBm = (fbBmRaw ?? []) as unknown as Array<{ id: string; bracket_id: string | null; round: number | null; is_bronze: boolean | null; side_a_registration_id: string | null; side_b_registration_id: string | null; score: unknown; status: string; scheduled_at: string | null; started_at: string | null }>;
      if (fbBm.length > 0) {
        const m = fbBm[0];
        return {
          matchId: m.id,
          matchType: "bracket" as MatchType,
          teamA: nameByReg.get(m.side_a_registration_id ?? "") ?? "Equipo A",
          teamB: nameByReg.get(m.side_b_registration_id ?? "") ?? "Equipo B",
          score: m.score,
          status: m.status,
          scheduledAt: m.scheduled_at,
          startedAt: m.started_at,
          matchScoringConfig: await resolveMatchScoringConfig(admin, "bracket", m.bracket_id ?? null, m.round ?? null, (m.is_bronze as boolean | null) ?? false, defaultScoringConfig),
        };
      }
    }

    // Fallback grupo: partidos de grupos sin cancha asignada
    const { data: catsRaw } = await admin
      .from("tournament_categories")
      .select("id")
      .eq("tournament_id", tournamentId);
    const catIds = ((catsRaw ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (catIds.length > 0) {
      const { data: grpsRaw } = await admin
        .from("tournament_groups")
        .select("id")
        .in("category_id", catIds);
      const groupIds = ((grpsRaw ?? []) as Array<{ id: string }>).map((g) => g.id);
      if (groupIds.length > 0) {
        const fetchFbGm = (from: number) =>
          admin
            .from("tournament_group_matches")
            .select("id, side_a_registration_id, side_b_registration_id, score, status, scheduled_at, started_at")
            .in("group_id", groupIds)
            .is("court_id", null)
            .eq("status", "scheduled")
            .order("scheduled_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from);
        let { data: fbGmRaw } = await fetchFbGm(fbOffset);
        if ((fbGmRaw ?? []).length === 0 && fbOffset > 0) {
          ({ data: fbGmRaw } = await fetchFbGm(0));
        }
        const fbGm = (fbGmRaw ?? []) as unknown as Array<{ id: string; side_a_registration_id: string; side_b_registration_id: string; score: unknown; status: string; scheduled_at: string | null; started_at: string | null }>;
        if (fbGm.length > 0) {
          const m = fbGm[0];
          return {
            matchId: m.id,
            matchType: "group" as MatchType,
            teamA: nameByReg.get(m.side_a_registration_id) ?? "Equipo A",
            teamB: nameByReg.get(m.side_b_registration_id) ?? "Equipo B",
            score: m.score,
            status: m.status,
            scheduledAt: m.scheduled_at,
            startedAt: m.started_at,
            matchScoringConfig: defaultScoringConfig,
          };
        }
      }
    }

    return null;
  });
}

// ── 10. Confirmar partido de bracket reportado por monitor ────────────────────

const ConfirmBracketMatchSchema = z.object({
  matchId: UuidSchema,
  tournamentId: UuidSchema,
});

export async function confirmBracketMatch(
  input: unknown,
): Promise<ActionResult<{ id: string; advanced: boolean }>> {
  return runAction(ConfirmBracketMatchSchema, input, async ({ matchId, tournamentId }) => {
    const { userId: callerId, actorRole } = await requireTournamentEditor(tournamentId);
    const admin: AnyClient = getAdminClient();

    const { data: matchRaw } = await admin
      .from("bracket_matches")
      .select(
        "id,bracket_id,round,position,status,winner_side,side_a_registration_id,side_b_registration_id,is_bronze",
      )
      .eq("id", matchId)
      .maybeSingle();

    const match = matchRaw as {
      id: string;
      bracket_id: string;
      round: number;
      position: number;
      status: string;
      winner_side: string | null;
      side_a_registration_id: string | null;
      side_b_registration_id: string | null;
      is_bronze: boolean | null;
    } | null;
    if (!match) throw new MpError("MONITORS.MATCH_NOT_FOUND", "Partido no encontrado", 404);
    if (match.status !== "reported") {
      throw new MpError("MONITORS.NOT_REPORTED", "El partido no está en estado reportado", 409);
    }

    const winnerSide = match.winner_side as "a" | "b" | null;
    if (!winnerSide) throw new MpError("MONITORS.NO_WINNER", "El partido no tiene ganador registrado", 422);

    const winnerRegId =
      winnerSide === "a" ? match.side_a_registration_id : match.side_b_registration_id;
    if (!winnerRegId) {
      throw new MpError("MONITORS.NO_WINNER_REG", "No hay inscripción en el lado ganador", 422);
    }

    const { data: bracket } = await admin
      .from("brackets")
      .select("id,tournament_id,category_id,size")
      .eq("id", match.bracket_id)
      .maybeSingle();
    if (!bracket || (bracket.tournament_id as string) !== tournamentId) {
      throw new MpError("MONITORS.MATCH_NOT_FOUND", "Partido no pertenece al torneo", 404);
    }

    await setAuditActor(admin, callerId, auditActorRole(actorRole));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await admin.from("bracket_matches").update({ status: "confirmed" } as any).eq("id", matchId);

    const round = match.round;
    const position = match.position;
    const size = bracket.size as number;
    const numRounds = Math.log2(size);
    const isBronze = (match.is_bronze as boolean | null) ?? false;
    let advanced = false;

    if (!isBronze && round < numRounds) {
      const nextRound = round + 1;
      const nextPos = Math.floor(position / 2);
      const isSideA = position % 2 === 0;

      const { data: nextSlot } = await admin
        .from("bracket_matches")
        .select("id,side_a_registration_id,side_b_registration_id")
        .eq("bracket_id", bracket.id as string)
        .eq("round", nextRound)
        .eq("position", nextPos)
        .maybeSingle();

      const alreadyAdvanced = isSideA
        ? (nextSlot?.side_a_registration_id as string | null) === winnerRegId
        : (nextSlot?.side_b_registration_id as string | null) === winnerRegId;

      if (!alreadyAdvanced) {
        const patch: Record<string, unknown> = {};
        if (isSideA) patch.side_a_registration_id = winnerRegId;
        else patch.side_b_registration_id = winnerRegId;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await admin.from("bracket_matches").update(patch as any)
          .eq("bracket_id", bracket.id as string)
          .eq("round", nextRound)
          .eq("position", nextPos);
        advanced = true;

        // Si el avance completa el siguiente partido, avisar a ambos lados.
        const otherSlot = (isSideA
          ? nextSlot?.side_b_registration_id
          : nextSlot?.side_a_registration_id) as string | null | undefined;
        if (nextSlot && otherSlot) {
          void notifyMatchReady(admin, {
            tournamentId,
            registrationIds: [winnerRegId, otherSlot],
            matchType: "bracket",
            matchId: nextSlot.id as string,
          });
        }
      }
    } else if (!isBronze && round === numRounds) {
      if (bracket.category_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await admin.from("tournament_categories").update({ stage: "complete" } as any)
          .eq("id", bracket.category_id as string);

        const { data: allCats } = await admin
          .from("tournament_categories")
          .select("stage")
          .eq("tournament_id", tournamentId);
        const allComplete = (allCats ?? []).length > 0 &&
          (allCats ?? []).every((c) => (c.stage as string | null) === "complete");
        if (allComplete) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await admin.from("tournaments").update({ status: "finished" } as any).eq("id", tournamentId);
          await notifyTournamentFinishedCore(admin, tournamentId);
        }
      } else {
        // Bracket sin categoría: solo auto-finalizar si el torneo NO tiene
        // categorías. Un bracket global legacy en un torneo multi-categoría no
        // debe cerrar el torneo con su primera final (las demás categorías
        // seguirían en juego); ese caso queda para el cierre manual.
        const { count: catCount } = await admin
          .from("tournament_categories")
          .select("id", { count: "exact", head: true })
          .eq("tournament_id", tournamentId);
        if ((catCount ?? 0) === 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await admin.from("tournaments").update({ status: "finished" } as any).eq("id", tournamentId);
          await notifyTournamentFinishedCore(admin, tournamentId);
        }
      }
    }

    return { id: matchId, advanced };
  });
}

// ── 11. Reportar incidente durante un partido ─────────────────────────────────

const ReportIncidentSchema = z.object({
  matchId: UuidSchema,
  matchType: z.enum(["bracket", "group"]),
  type: z.enum(["behavior", "equipment", "weather", "other"]),
  notes: z.string().max(500).optional(),
  slug: SlugSchema,
});

export async function reportMatchIncident(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(ReportIncidentSchema, input, async ({ matchId, matchType, type, notes, slug }) => {
    await requireMonitorsEnabled();
    const userId = await requireUserId();
    const admin: AnyClient = getAdminClient();

    const { data: t } = await admin.from("tournaments").select("id, name, slug, partner_id, club_id").eq("slug", slug).maybeSingle();
    if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);
    const tournamentId = t.id as string;

    const assignments = await requireMonitorAssignment(userId, tournamentId, admin);
    const courtId = assignments[0].court_id;

    await setAuditActor(admin, userId, "user");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (admin as any)
      .from("match_incidents")
      .insert({
        match_id: matchId,
        match_type: matchType,
        tournament_id: tournamentId,
        court_id: courtId,
        reported_by: userId,
        type,
        notes: notes ?? null,
      })
      .select("id")
      .single();

    if (error) throw new MpError("MONITORS.INCIDENT_FAILED", "Error al registrar el incidente", 500);

    const partnerId = t.partner_id as string | null;
    const clubId = t.club_id as string | null;
    const typeLabels: Record<string, string> = {
      behavior: "Conducta",
      equipment: "Equipamiento",
      weather: "Clima",
      other: "Otro",
    };
    const incidentNotif = {
      kind: "match_incident_reported",
      title: "Incidente en cancha",
      body: `El monitor reportó un incidente: ${typeLabels[type] ?? type}.`,
      payload: {
        tournament_id: tournamentId,
        tournament_slug: t.slug,
        incident_type: type,
      },
    };
    if (partnerId) {
      void notifyPartnerOrgStaff({ partnerId, ...incidentNotif });
    } else if (clubId) {
      // Torneo organizado por un club (sin partner): avisar al owner/manager.
      void notifyClubStaff({ clubId, ...incidentNotif });
    }

    return { id: (row as { id: string }).id };
  });
}

// ── Helper: labels de inscripciones ──────────────────────────────────────────

async function buildRegLabels(
  admin: AnyClient,
  tournamentId: string,
): Promise<Map<string, string>> {
  const { data: regs } = await admin
    .from("registrations")
    .select("id, player_ids, teams(name)")
    .eq("tournament_id", tournamentId);

  const regIds = (regs ?? []).map((r) => (r as { id: string }).id);

  // guest_names no está en los tipos generados — fetch separado.
  const guestsByRegId = new Map<string, string[]>();
  if (regIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: gr } = await admin.from("registrations").select("id,guest_names" as any).in("id", regIds) as unknown as {
      data: Array<{ id: string; guest_names: string[] | null }> | null;
    };
    for (const g of gr ?? []) {
      if (g.guest_names?.length) guestsByRegId.set(g.id, g.guest_names);
    }
  }

  const playerIdSet = new Set<string>();
  for (const r of (regs ?? []) as Array<{ player_ids: string[] | null }>) {
    for (const pid of r.player_ids ?? []) playerIdSet.add(pid);
  }

  const profById = new Map<string, string>();
  if (playerIdSet.size > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", Array.from(playerIdSet));
    for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
      profById.set(p.id, p.display_name ?? "Jugador");
    }
  }

  const out = new Map<string, string>();
  for (const r of (regs ?? []) as Array<{
    id: string;
    player_ids: string[] | null;
    teams?: { name?: string } | null;
  }>) {
    const pids = r.player_ids ?? [];
    const guestNames = guestsByRegId.get(r.id) ?? [];
    const teamName = r.teams?.name ?? null;
    const first = pids[0] ? profById.get(pids[0]) : null;
    const label =
      teamName ??
      (guestNames.length > 0
        ? guestNames.join(" / ")
        : pids.length > 1 && first
          ? `${first} +${pids.length - 1}`
          : first ?? "Equipo");
    out.set(r.id, label);
  }
  return out;
}
