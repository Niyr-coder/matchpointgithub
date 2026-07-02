"use server";

/**
 * Acciones de servidor para torneos de liga (round_robin y swiss).
 * Usa tournament_groups/tournament_group_matches como storage,
 * pero con un flujo distinto: un grupo por categoría, confirmación directa
 * (sin fase de revisión separada), y standings en tiempo real.
 */
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor, auditActorRole } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { UuidSchema } from "@/lib/schemas/common";
import { requireTournamentEditor } from "@/server/actions/tournaments";
import { notifyCategoryFinished, notifyGroupsDrawn, notifyTournamentFinishedCore } from "@/lib/notifications/tournament";
import {
  buildRoundRobinRounds,
  computeGroupStandings,
} from "@/lib/tournaments/group-stage";
import type { GroupMatchResult, GroupStandingRow } from "@/lib/tournaments/group-stage";

const LIGA_FORMATS = new Set(["round_robin", "swiss"]);

// ---------------------------------------------------------------------------
// Auth helper — valida formato de liga y delega la autorización al guard
// centralizado (admin / partner org / club staff del torneo). Antes tenía su
// propia copia SIN el branch de club anfitrión (misma clase de bug que cerró
// el commit 10187ea).
// ---------------------------------------------------------------------------
async function requireLigaEditor(tournamentId: string) {
  const supabase = await getServerClient();
  const { data: t } = await supabase
    .from("tournaments")
    .select("format")
    .eq("id", tournamentId)
    .single();
  if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);
  if (!LIGA_FORMATS.has(t.format as string)) {
    throw new MpError("LIGA.WRONG_FORMAT", "Este torneo no usa formato de liga", 422);
  }
  return requireTournamentEditor(tournamentId);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type LigaMatchRow = {
  id: string;
  roundNo: number;
  matchNo: number;
  sideARegistrationId: string;
  sideBRegistrationId: string;
  status: string;
  winnerSide: "a" | "b" | null;
  score: Record<string, unknown> | null;
};

export type LigaData = {
  hasSchedule: boolean;
  groupId: string | null;
  memberRegistrationIds: string[];
  matches: LigaMatchRow[];
  standings: GroupStandingRow[];
  /** 'complete' = liga cerrada (campeón publicado, marcadores read-only). */
  categoryStage: string | null;
};

// ---------------------------------------------------------------------------
// Data loader — callable desde server components
// ---------------------------------------------------------------------------
export async function getLigaData(
  tournamentId: string,
  categoryId: string,
): Promise<LigaData> {
  const admin = getAdminClient();

  const [{ data: groups }, { data: catRow }] = await Promise.all([
    admin
      .from("tournament_groups")
      .select("id")
      .eq("category_id", categoryId)
      .order("sort_order", { ascending: true })
      .limit(1),
    admin
      .from("tournament_categories")
      .select("stage")
      .eq("id", categoryId)
      .maybeSingle(),
  ]);
  const categoryStage = (catRow?.stage as string | null) ?? null;

  const group = groups?.[0] ?? null;
  if (!group) {
    return {
      hasSchedule: false,
      groupId: null,
      memberRegistrationIds: [],
      matches: [],
      standings: [],
      categoryStage,
    };
  }

  const groupId = group.id as string;

  const { data: members } = await admin
    .from("tournament_group_members")
    .select("registration_id")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: true });
  const memberRegistrationIds = (members ?? []).map((m) => m.registration_id as string);

  const { data: rawMatches } = await admin
    .from("tournament_group_matches")
    .select("id,round_no,match_no,side_a_registration_id,side_b_registration_id,status,winner_side,score")
    .eq("group_id", groupId)
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });

  const matches: LigaMatchRow[] = (rawMatches ?? []).map((m) => ({
    id: m.id as string,
    roundNo: m.round_no as number,
    matchNo: m.match_no as number,
    sideARegistrationId: m.side_a_registration_id as string,
    sideBRegistrationId: m.side_b_registration_id as string,
    status: m.status as string,
    winnerSide: (m.winner_side as "a" | "b" | null) ?? null,
    score: (m.score as Record<string, unknown> | null) ?? null,
  }));

  const matchResults: GroupMatchResult[] = matches.map((m) => ({
    sideARegistrationId: m.sideARegistrationId,
    sideBRegistrationId: m.sideBRegistrationId,
    status: m.status,
    winnerSide: m.winnerSide,
    score: m.score as { sets?: Array<{ a: number; b: number }> } | null,
  }));
  const standings = computeGroupStandings(memberRegistrationIds, matchResults);

  return { hasSchedule: true, groupId, memberRegistrationIds, matches, standings, categoryStage };
}

// ---------------------------------------------------------------------------
// generateRoundRobinSchedule
// ---------------------------------------------------------------------------
const GenerateRoundRobinSchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema,
});

export async function generateRoundRobinSchedule(
  input: unknown,
): Promise<ActionResult<{ groupId: string; matchesCreated: number }>> {
  return runAction(GenerateRoundRobinSchema, input, async ({ tournamentId, categoryId }) => {
    const editor = await requireLigaEditor(tournamentId);
    const admin = getAdminClient();

    const { data: cat } = await admin
      .from("tournament_categories")
      .select("id,tournament_id")
      .eq("id", categoryId)
      .eq("tournament_id", tournamentId)
      .single();
    if (!cat) throw new MpError("CATEGORY.NOT_FOUND", "Categoría no pertenece al torneo", 404);

    const { count: existingGroups } = await admin
      .from("tournament_groups")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId);
    if ((existingGroups ?? 0) > 0) {
      throw new MpError(
        "LIGA.ALREADY_GENERATED",
        "El calendario ya fue generado para esta categoría",
        409,
      );
    }

    const { data: regsRaw } = await admin
      .from("registrations")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("category_id", categoryId)
      .eq("status", "accepted");
    const regIds = (regsRaw ?? []).map((r) => r.id as string);

    if (regIds.length < 2) {
      throw new MpError(
        "LIGA.NOT_ENOUGH_TEAMS",
        "Necesitas al menos 2 equipos aceptados para generar el calendario",
        422,
      );
    }

    await setAuditActor(admin, editor.userId, auditActorRole(editor.actorRole));

    const { data: groupRow, error: gErr } = await admin
      .from("tournament_groups")
      .insert({
        category_id: categoryId,
        name: "Liga",
        sort_order: 0,
      } as never)
      .select("id")
      .single();
    if (gErr) throw new MpError("LIGA.GROUP_FAILED", gErr.message, 500);
    const groupId = groupRow.id as string;

    const memberRows = regIds.map((regId, idx) => ({
      group_id: groupId,
      registration_id: regId,
      sort_order: idx,
    }));
    const { error: mErr } = await admin
      .from("tournament_group_members")
      .insert(memberRows as never);
    if (mErr) throw new MpError("LIGA.MEMBERS_FAILED", mErr.message, 500);

    const rounds = buildRoundRobinRounds(regIds);
    const matchRows: Record<string, unknown>[] = [];
    rounds.forEach((pairs, roundIdx) => {
      pairs.forEach(([a, b], matchIdx) => {
        matchRows.push({
          group_id: groupId,
          round_no: roundIdx + 1,
          match_no: matchIdx + 1,
          side_a_registration_id: a,
          side_b_registration_id: b,
          status: "scheduled",
        });
      });
    });

    const { error: gmErr } = await admin
      .from("tournament_group_matches")
      .insert(matchRows as never);
    if (gmErr) throw new MpError("LIGA.MATCHES_FAILED", gmErr.message, 500);

    // "Te toca jugar": una notif por jugador con copy de liga.
    void notifyGroupsDrawn(admin, {
      tournamentId,
      categoryId,
      title: "Tu calendario de liga está listo",
      bodyTemplate: (name) => `El calendario de ${name} está listo. Revisa tus fechas y partidos.`,
    });

    return { groupId, matchesCreated: matchRows.length };
  });
}

// ---------------------------------------------------------------------------
// reportLigaMatch — confirma directamente (sin paso de revisión intermedio)
// ---------------------------------------------------------------------------
const ReportLigaMatchSchema = z.object({
  tournamentId: UuidSchema,
  matchId: UuidSchema,
  winnerSide: z.enum(["a", "b"]),
  score: z.record(z.string(), z.unknown()).optional(),
});

export async function reportLigaMatch(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(ReportLigaMatchSchema, input, async ({ tournamentId, matchId, winnerSide, score }) => {
    const editor = await requireLigaEditor(tournamentId);
    const admin = getAdminClient();

    const { data: match } = await admin
      .from("tournament_group_matches")
      .select("id,group_id,status")
      .eq("id", matchId)
      .single();
    if (!match) throw new MpError("LIGA.MATCH_NOT_FOUND", "Partido no encontrado", 404);

    const { data: group } = await admin
      .from("tournament_groups")
      .select("category_id")
      .eq("id", match.group_id as string)
      .single();
    const { data: cat } = await admin
      .from("tournament_categories")
      .select("tournament_id,stage")
      .eq("id", (group?.category_id as string) ?? "")
      .single();
    if ((cat?.tournament_id as string) !== tournamentId) {
      throw new MpError("LIGA.MATCH_NOT_FOUND", "Partido no pertenece al torneo", 404);
    }
    if ((cat?.stage as string | null) === "complete") {
      throw new MpError("LIGA.CLOSED", "La liga ya fue finalizada", 409);
    }

    await setAuditActor(admin, editor.userId, auditActorRole(editor.actorRole));
    const { error } = await admin
      .from("tournament_group_matches")
      .update({
        winner_side: winnerSide,
        score: score ?? null,
        status: "confirmed",
      } as never)
      .eq("id", matchId);
    if (error) throw new MpError("LIGA.REPORT_FAILED", error.message, 500);
    return { id: matchId };
  });
}

// ---------------------------------------------------------------------------
// correctLigaMatch — corrige un resultado ya confirmado
// ---------------------------------------------------------------------------
export async function correctLigaMatch(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(ReportLigaMatchSchema, input, async ({ tournamentId, matchId, winnerSide, score }) => {
    const editor = await requireLigaEditor(tournamentId);
    const admin = getAdminClient();

    const { data: match } = await admin
      .from("tournament_group_matches")
      .select("id,group_id,status")
      .eq("id", matchId)
      .single();
    if (!match) throw new MpError("LIGA.MATCH_NOT_FOUND", "Partido no encontrado", 404);

    const { data: group } = await admin
      .from("tournament_groups")
      .select("category_id")
      .eq("id", match.group_id as string)
      .single();
    const { data: cat } = await admin
      .from("tournament_categories")
      .select("tournament_id,stage")
      .eq("id", (group?.category_id as string) ?? "")
      .single();
    if ((cat?.tournament_id as string) !== tournamentId) {
      throw new MpError("LIGA.MATCH_NOT_FOUND", "Partido no pertenece al torneo", 404);
    }
    if ((cat?.stage as string | null) === "complete") {
      throw new MpError("LIGA.CLOSED", "La liga ya fue finalizada", 409);
    }

    await setAuditActor(admin, editor.userId, auditActorRole(editor.actorRole));
    const { error } = await admin
      .from("tournament_group_matches")
      .update({
        winner_side: winnerSide,
        score: score ?? null,
        status: "confirmed",
      } as never)
      .eq("id", matchId);
    if (error) throw new MpError("LIGA.CORRECT_FAILED", error.message, 500);
    return { id: matchId };
  });
}

// ---------------------------------------------------------------------------
// closeLigaStage — finaliza la liga de una categoría.
// Exige todos los partidos confirmados, marca la categoría 'complete' y, si
// todas las categorías del torneo están completas, pasa el torneo a
// 'finished' + notif tournament_finished (mismo contrato que confirmBracketMatch
// y reportBracketMatch en la final).
// ---------------------------------------------------------------------------
const CloseLigaSchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema,
});

export async function closeLigaStage(
  input: unknown,
): Promise<ActionResult<{ championRegistrationId: string | null; tournamentFinished: boolean }>> {
  return runAction(CloseLigaSchema, input, async ({ tournamentId, categoryId }) => {
    const editor = await requireLigaEditor(tournamentId);
    const admin = getAdminClient();

    const { data: cat } = await admin
      .from("tournament_categories")
      .select("id,tournament_id,stage")
      .eq("id", categoryId)
      .eq("tournament_id", tournamentId)
      .single();
    if (!cat) throw new MpError("CATEGORY.NOT_FOUND", "Categoría no pertenece al torneo", 404);
    if ((cat.stage as string | null) === "complete") {
      throw new MpError("LIGA.CLOSED", "La liga ya fue finalizada", 409);
    }

    const liga = await getLigaData(tournamentId, categoryId);
    if (!liga.hasSchedule || liga.matches.length === 0) {
      throw new MpError("LIGA.NO_SCHEDULE", "Genera el calendario antes de cerrar la liga", 409);
    }
    const pending = liga.matches.filter((m) => m.status !== "confirmed").length;
    if (pending > 0) {
      throw new MpError(
        "LIGA.MATCHES_PENDING",
        `Faltan ${pending} partidos por confirmar antes de cerrar la liga`,
        409,
      );
    }

    await setAuditActor(admin, editor.userId, auditActorRole(editor.actorRole));

    const { error: stErr } = await admin
      .from("tournament_categories")
      .update({ stage: "complete" } as never)
      .eq("id", categoryId);
    if (stErr) throw new MpError("LIGA.CLOSE_FAILED", stErr.message, 500);

    const championRegistrationId = liga.standings[0]?.registrationId ?? null;

    void notifyCategoryFinished(admin, {
      tournamentId,
      categoryId,
      championRegistrationId,
    });

    // Si todas las categorías del torneo quedaron completas → finished + notif.
    const { data: allCats } = await admin
      .from("tournament_categories")
      .select("stage")
      .eq("tournament_id", tournamentId);
    const allComplete =
      (allCats ?? []).length > 0 &&
      (allCats ?? []).every((c) => (c.stage as string | null) === "complete");
    if (allComplete) {
      await admin
        .from("tournaments")
        .update({ status: "finished" } as never)
        .eq("id", tournamentId);
      await notifyTournamentFinishedCore(admin, tournamentId);
    }

    return { championRegistrationId, tournamentFinished: allComplete };
  });
}
