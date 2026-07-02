"use server";
import "server-only";

import { z } from "zod";
import { getAdminClient, setAuditActor, auditActorRole } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { UuidSchema } from "@/lib/schemas/common";
import { requireTournamentEditor } from "@/server/actions/tournaments";

// ── Tipos exportados ─────────────────────────────────────────────────────────

export type CourtLiveMatch = {
  matchId: string;
  matchType: "bracket" | "group";
  /** Nombre de la categoría del partido (null = bracket global legacy). */
  categoryName: string | null;
  teamA: string;
  teamB: string;
  setsCompleted: Array<{ a: number; b: number }>;
  /** Puntos del set en curso (persistidos por el monitor con debounce). */
  currentPoints: { a: number; b: number } | null;
  status: "scheduled" | "live" | "reported";
  scheduledAt: string | null;
};

export type CourtLiveStatus = {
  courtId: string;
  courtCode: string | null;
  courtName: string | null;
  monitorDisplayName: string;
  monitorUsername: string;
  currentMatch: CourtLiveMatch | null;
};

// ── Action: listar estado en vivo de canchas ──────────────────────────────────

const ListCourtsLiveSchema = z.object({ tournamentId: UuidSchema });

export async function listCourtsLiveStatus(
  input: unknown,
): Promise<ActionResult<{ courts: CourtLiveStatus[]; reportedCount: number }>> {
  return runAction(ListCourtsLiveSchema, input, async ({ tournamentId }) => {
    await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();

    // 1. Obtener monitores activos
    const { data: monitorsRaw } = await admin
      .from("tournament_court_monitors")
      .select("court_id, user_id, courts(code, name), profiles!tournament_court_monitors_user_id_fkey(display_name, username)")
      .eq("tournament_id", tournamentId)
      .eq("is_active", true);

    type MonitorRow = {
      court_id: string;
      user_id: string;
      courts: { code?: string | null; name?: string | null } | null;
      profiles: { display_name?: string | null; username?: string | null } | null;
    };

    const monitors = (monitorsRaw ?? []) as unknown as MonitorRow[];
    if (monitors.length === 0) {
      return { courts: [], reportedCount: 0 };
    }

    const courtIds = monitors.map((m) => m.court_id);

    // 2. Para cada cancha, buscar el partido actual en bracket y grupo en paralelo.
    // La categoría viene embebida (brackets.category_id / tournament_groups.category_id)
    // — nada de queries extra por cancha; los nombres se resuelven en un batch después.
    type RawMatch = {
      id: string;
      side_a_registration_id: string | null;
      side_b_registration_id: string | null;
      score: unknown;
      status: string;
      scheduled_at: string | null;
      brackets?: { category_id: string | null } | null;
      tournament_groups?: { category_id: string | null } | null;
    };

    const matchByCourtId = new Map<
      string,
      { match: RawMatch; matchType: "bracket" | "group"; categoryId: string | null }
    >();

    await Promise.all(
      monitors.map(async (monitor) => {
        const courtId = monitor.court_id;

        const [{ data: bmRaw }, { data: gmRaw }] = await Promise.all([
          admin
            .from("bracket_matches")
            .select(
              "id, side_a_registration_id, side_b_registration_id, score, status, scheduled_at, brackets(category_id)",
            )
            .eq("court_id", courtId)
            .in("status", ["scheduled", "live", "reported"])
            .order("scheduled_at", { ascending: true })
            .limit(1),
          admin
            .from("tournament_group_matches")
            .select(
              "id, side_a_registration_id, side_b_registration_id, score, status, scheduled_at, tournament_groups(category_id)",
            )
            .eq("court_id", courtId)
            .in("status", ["scheduled", "live", "reported"])
            .order("scheduled_at", { ascending: true })
            .limit(1),
        ]);

        const bm = ((bmRaw ?? []) as unknown as RawMatch[])[0] ?? null;
        const gm = ((gmRaw ?? []) as unknown as RawMatch[])[0] ?? null;

        if (!bm && !gm) return;

        let chosen: { match: RawMatch; matchType: "bracket" | "group" };
        if (bm && gm) {
          const bAt = bm.scheduled_at ?? "";
          const gAt = gm.scheduled_at ?? "";
          chosen =
            bAt <= gAt
              ? { match: bm, matchType: "bracket" }
              : { match: gm, matchType: "group" };
        } else if (bm) {
          chosen = { match: bm, matchType: "bracket" };
        } else {
          chosen = { match: gm!, matchType: "group" };
        }

        const categoryId =
          chosen.matchType === "bracket"
            ? chosen.match.brackets?.category_id ?? null
            : chosen.match.tournament_groups?.category_id ?? null;

        matchByCourtId.set(courtId, { ...chosen, categoryId });
      }),
    );

    // 2b. Resolver nombres de categoría en un solo batch.
    const categoryIds = new Set<string>();
    for (const { categoryId } of matchByCourtId.values()) {
      if (categoryId) categoryIds.add(categoryId);
    }
    const catNameById = new Map<string, string>();
    if (categoryIds.size > 0) {
      const { data: catRows } = await admin
        .from("tournament_categories")
        .select("id,name")
        .in("id", Array.from(categoryIds));
      for (const c of catRows ?? []) {
        catNameById.set(c.id as string, c.name as string);
      }
    }

    // 3. Recopilar todos los registration_id y construir labels
    const allRegIds = new Set<string>();
    for (const { match } of matchByCourtId.values()) {
      if (match.side_a_registration_id) allRegIds.add(match.side_a_registration_id);
      if (match.side_b_registration_id) allRegIds.add(match.side_b_registration_id);
    }

    const nameByReg = new Map<string, string>();
    if (allRegIds.size > 0) {
      const { data: regsRaw } = await admin
        .from("registrations")
        .select("id, player_ids, teams(name)")
        .in("id", Array.from(allRegIds));

      type RegRow = {
        id: string;
        player_ids: string[] | null;
        teams?: { name?: string } | null;
      };
      const regs = (regsRaw ?? []) as unknown as RegRow[];

      const playerIdSet = new Set<string>();
      for (const r of regs) {
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

      for (const r of regs) {
        const pids = r.player_ids ?? [];
        const teamName = r.teams?.name ?? null;
        const first = pids[0] ? profById.get(pids[0]) : null;
        const label =
          teamName ??
          (pids.length > 1 && first ? `${first} +${pids.length - 1}` : first ?? "Equipo");
        nameByReg.set(r.id, label);
      }
    }

    // 4. Contar partidos reportados en todas las canchas monitoreadas
    const [{ count: bmReported }, { count: gmReported }] = await Promise.all([
      admin
        .from("bracket_matches")
        .select("id", { count: "exact", head: true })
        .in("court_id", courtIds)
        .eq("status", "reported"),
      admin
        .from("tournament_group_matches")
        .select("id", { count: "exact", head: true })
        .in("court_id", courtIds)
        .eq("status", "reported"),
    ]);
    const reportedCount = (bmReported ?? 0) + (gmReported ?? 0);

    // 5. Mapear a CourtLiveStatus[]
    const courts: CourtLiveStatus[] = monitors.map((monitor) => {
      const court = monitor.courts;
      const profile = monitor.profiles;
      const found = matchByCourtId.get(monitor.court_id) ?? null;

      let currentMatch: CourtLiveMatch | null = null;
      if (found) {
        const { match, matchType, categoryId } = found;
        const scoreRaw = match.score as { sets?: Array<{ a: number; b: number }>; current?: { a: number; b: number } } | null;
        const setsCompleted = scoreRaw?.sets ?? [];
        currentMatch = {
          matchId: match.id,
          matchType,
          categoryName: categoryId ? catNameById.get(categoryId) ?? null : null,
          teamA: nameByReg.get(match.side_a_registration_id ?? "") ?? "Equipo A",
          teamB: nameByReg.get(match.side_b_registration_id ?? "") ?? "Equipo B",
          setsCompleted,
          currentPoints: scoreRaw?.current ?? null,
          status: match.status as CourtLiveMatch["status"],
          scheduledAt: match.scheduled_at,
        };
      }

      return {
        courtId: monitor.court_id,
        courtCode: court?.code ?? null,
        courtName: court?.name ?? null,
        monitorDisplayName: profile?.display_name ?? profile?.username ?? "Monitor",
        monitorUsername: profile?.username ?? "",
        currentMatch,
      };
    });

    return { courts, reportedCount };
  });
}

// ── Action: listar incidentes de partido ─────────────────────────────────────

export type MatchIncident = {
  id: string;
  matchId: string;
  matchType: "bracket" | "group";
  type: "behavior" | "equipment" | "weather" | "other";
  notes: string | null;
  courtCode: string | null;
  courtName: string | null;
  monitorDisplayName: string | null;
  createdAt: string;
};

const ListMatchIncidentsSchema = z.object({ tournamentId: UuidSchema });

export async function listMatchIncidents(
  input: unknown,
): Promise<ActionResult<{ incidents: MatchIncident[] }>> {
  return runAction(ListMatchIncidentsSchema, input, async ({ tournamentId }) => {
    await requireTournamentEditor(tournamentId);
    const db = await getServerClient();

    type IncidentRow = {
      id: string;
      match_id: string;
      match_type: string;
      type: string;
      notes: string | null;
      created_at: string;
      courts: { code: string | null; name: string | null } | null;
      profiles: { display_name: string | null; username: string | null } | null;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from("match_incidents")
      .select(
        "id, match_id, match_type, type, notes, created_at, courts(code, name), profiles!match_incidents_reported_by_fkey(display_name, username)",
      )
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false })
      .limit(50) as { data: IncidentRow[] | null; error: { message: string } | null };

    if (error) throw new MpError("MONITORS.INCIDENTS_LOAD_FAILED", "Error al cargar incidentes", 500);

    const incidents: MatchIncident[] = (data ?? []).map((r) => ({
      id: r.id,
      matchId: r.match_id,
      matchType: r.match_type as MatchIncident["matchType"],
      type: r.type as MatchIncident["type"],
      notes: r.notes,
      courtCode: r.courts?.code ?? null,
      courtName: r.courts?.name ?? null,
      monitorDisplayName: r.profiles?.display_name ?? r.profiles?.username ?? null,
      createdAt: r.created_at,
    }));

    return { incidents };
  });
}

// ── Action: cronograma por cancha (Fase A2) ──────────────────────────────────
// Asigna court_id + scheduled_at en grilla (canchas × slots) a los partidos
// SIN programar que ya tienen ambos lados definidos. Cubre los 3 formatos
// (bracket_matches + tournament_group_matches vía tournament_id denormalizado)
// y es RE-ejecutable: las rondas que se van llenando se programan al volver a
// correrla. Con esto los monitores dejan de depender del claim atómico y el
// jugador ve hora + cancha en su vista.

const ScheduleMatchesSchema = z.object({
  tournamentId: UuidSchema,
  courtIds: z.array(UuidSchema).min(1).max(12),
  startsAt: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: "Fecha de inicio inválida",
  }),
  slotMinutes: z.number().int().min(15).max(240),
});

export async function scheduleTournamentMatches(
  input: unknown,
): Promise<ActionResult<{ scheduled: number }>> {
  return runAction(ScheduleMatchesSchema, input, async ({ tournamentId, courtIds, startsAt, slotMinutes }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();

    const [{ data: gmsRaw }, { data: bmsRaw }] = await Promise.all([
      admin
        .from("tournament_group_matches")
        .select("id,round_no,match_no")
        .eq("tournament_id", tournamentId)
        .is("scheduled_at", null)
        .eq("status", "scheduled")
        .order("round_no", { ascending: true })
        .order("match_no", { ascending: true }),
      admin
        .from("bracket_matches")
        .select("id,round,position")
        .eq("tournament_id", tournamentId)
        .is("scheduled_at", null)
        .eq("status", "scheduled")
        .not("side_a_registration_id", "is", null)
        .not("side_b_registration_id", "is", null)
        .order("round", { ascending: true })
        .order("position", { ascending: true }),
    ]);

    // Grupos/liga primero (fase inicial), luego eliminatoria por ronda.
    const queue: Array<{ table: "tournament_group_matches" | "bracket_matches"; id: string }> = [
      ...((gmsRaw ?? []) as Array<{ id: string }>).map((m) => ({
        table: "tournament_group_matches" as const,
        id: m.id,
      })),
      ...((bmsRaw ?? []) as Array<{ id: string }>).map((m) => ({
        table: "bracket_matches" as const,
        id: m.id,
      })),
    ];
    if (queue.length === 0) return { scheduled: 0 };

    await setAuditActor(admin, editor.userId, auditActorRole(editor.actorRole));

    const startMs = new Date(startsAt).getTime();
    let scheduled = 0;
    // Batches de 10 updates concurrentes (cada partido tiene cancha/hora distinta).
    for (let i = 0; i < queue.length; i += 10) {
      const batch = queue.slice(i, i + 10);
      const results = await Promise.all(
        batch.map((q, j) => {
          const k = i + j;
          const courtId = courtIds[k % courtIds.length];
          const at = new Date(startMs + Math.floor(k / courtIds.length) * slotMinutes * 60000).toISOString();
          return admin
            .from(q.table)
            .update({ court_id: courtId, scheduled_at: at } as never)
            .eq("id", q.id);
        }),
      );
      scheduled += results.filter((r) => !r.error).length;
    }

    return { scheduled };
  });
}
