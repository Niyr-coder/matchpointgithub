"use server";

import "server-only";

import { z } from "zod";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireUserId } from "@/lib/auth/session";
import { UuidSchema, SlugSchema } from "@/lib/schemas/common";

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
};

export type SetScore = { a: number; b: number };
export type MatchScore = { sets: SetScore[]; serving?: "a" | "b" };

// ── Helpers de autorización ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

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

async function requirePartnerAdminForTournament(tournamentId: string): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");

  const { data: t } = await supabase
    .from("tournaments")
    .select("partner_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

  const { data: adminRow } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (adminRow) return user.id;

  const partnerId = (t.partner_id as string | null) ?? null;
  if (!partnerId) throw new AuthError("AUTH.ROLE_REQUIRED", "Torneo sin partner — solo admin");

  const { data: member } = await supabase
    .from("partner_members")
    .select("user_id")
    .eq("partner_id", partnerId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!member) throw new AuthError("AUTH.ROLE_REQUIRED", "Sin permiso para gestionar este torneo");

  return user.id;
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
    const callerId = await requirePartnerAdminForTournament(tournamentId);
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

    await setAuditActor(admin, callerId, "partner");

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

    const callerId = await requirePartnerAdminForTournament(row.tournament_id as string);
    await setAuditActor(admin, callerId, "partner");

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
      .select("id, name")
      .eq("slug", slug)
      .maybeSingle();
    if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);
    const tournamentId = t.id as string;

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
      .select("id, side_a_registration_id, side_b_registration_id, score, status, scheduled_at")
      .eq("court_id", assignment.court_id)
      .in("status", ["scheduled", "live"])
      .order("scheduled_at", { ascending: true })
      .limit(1);

    const bm = (bmRaw ?? []) as Array<{
      id: string;
      side_a_registration_id: string | null;
      side_b_registration_id: string | null;
      score: unknown;
      status: string;
      scheduled_at: string | null;
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
      };
    } else {
      const { data: gmRaw } = await admin
        .from("tournament_group_matches")
        .select(
          "id, side_a_registration_id, side_b_registration_id, score, status, scheduled_at",
        )
        .eq("court_id", assignment.court_id)
        .in("status", ["scheduled", "live"])
        .order("scheduled_at", { ascending: true })
        .limit(1);

      const gm = (gmRaw ?? []) as Array<{
        id: string;
        side_a_registration_id: string;
        side_b_registration_id: string;
        score: unknown;
        status: string;
        scheduled_at: string | null;
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
        };
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

    const { data: t } = await admin.from("tournaments").select("id").eq("slug", slug).maybeSingle();
    if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

    await requireMonitorAssignment(userId, t.id as string, admin);
    await setAuditActor(admin, userId, "user");

    const score: MatchScore = { sets: [{ a: 0, b: 0 }], serving: servingFirst };
    const table = matchType === "bracket" ? "bracket_matches" : "tournament_group_matches";
    await admin.from(table).update({ status: "live", score }).eq("id", matchId);
  });
}

// ── 5. Actualizar score de set completado ────────────────────────────────────

const UpdateScoreSchema = z.object({
  matchId: UuidSchema,
  matchType: z.enum(["bracket", "group"]),
  score: z.object({
    sets: z.array(z.object({ a: z.number().int().min(0), b: z.number().int().min(0) })).min(1),
    serving: z.enum(["a", "b"]).optional(),
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

    await requireMonitorAssignment(userId, t.id as string, admin);
    await setAuditActor(admin, userId, "user");

    const table = matchType === "bracket" ? "bracket_matches" : "tournament_group_matches";
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
  slug: SlugSchema,
});

export async function submitMatchResult(input: unknown): Promise<ActionResult<void>> {
  return runAction(SubmitResultSchema, input, async ({ matchId, matchType, score, winnerSide, slug }) => {
    await requireMonitorsEnabled();
    const userId = await requireUserId();
    const admin: AnyClient = getAdminClient();

    const { data: t } = await admin.from("tournaments").select("id").eq("slug", slug).maybeSingle();
    if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

    await requireMonitorAssignment(userId, t.id as string, admin);
    await setAuditActor(admin, userId, "user");

    const table = matchType === "bracket" ? "bracket_matches" : "tournament_group_matches";
    await admin.from(table).update({ status: "reported", score, winner_side: winnerSide }).eq("id", matchId);
  });
}

// ── 7. Listar monitores asignados (panel partner) ────────────────────────────

const ListMonitorsSchema = z.object({ tournamentId: UuidSchema });

export async function listCourtMonitors(
  input: unknown,
): Promise<ActionResult<CourtMonitorAssignment[]>> {
  return runAction(ListMonitorsSchema, input, async ({ tournamentId }) => {
    await requireMonitorsEnabled();
    await requirePartnerAdminForTournament(tournamentId);
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
      const profile = row[
        "profiles!tournament_court_monitors_user_id_fkey"
      ] as { display_name?: string; username?: string } | null;
      return {
        id: row.id as string,
        tournamentId,
        courtId: row.court_id as string,
        courtCode: court?.code ?? null,
        courtName: court?.name ?? null,
        userId: row.user_id as string,
        displayName: profile?.display_name ?? "Usuario",
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

// ── Helper: labels de inscripciones ──────────────────────────────────────────

async function buildRegLabels(
  admin: AnyClient,
  tournamentId: string,
): Promise<Map<string, string>> {
  const { data: regs } = await admin
    .from("registrations")
    .select("id, player_ids, teams(name)")
    .eq("tournament_id", tournamentId);

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
    const teamName = r.teams?.name ?? null;
    const first = pids[0] ? profById.get(pids[0]) : null;
    const label =
      teamName ?? (pids.length > 1 && first ? `${first} +${pids.length - 1}` : first ?? "Equipo");
    out.set(r.id, label);
  }
  return out;
}
