"use server";

/**
 * Fase de grupos + eliminatoria para torneos `groups_to_knockout`.
 * Ver docs/product/01-tournaments.md §13.
 */
import "server-only";

import { z } from "zod";
import { getAdminClient, setAuditActor, auditActorRole } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { UuidSchema } from "@/lib/schemas/common";
import { requireTournamentEditor } from "@/server/actions/tournaments";
import {
  GroupPlayoffConfigSchema,
  GroupSchedulingConfigSchema,
} from "@/lib/schemas/tournaments";
import {
  buildGroupCourtSchedule,
  normalizeSchedulingConfig,
  type MatchToSchedule,
} from "@/lib/tournaments/group-court-schedule";
import {
  buildRoundRobinRounds,
  computeGroupStandings,
  crossGroupFirstRound,
  distributeToGroups,
  groupLabel,
  nextPowerOfTwo,
  pickAllQualifiers,
  rankQualifiersGlobally,
  standardBracketPairings,
  validateGroupPlayoffConfig,
  wildcardCount,
  type GroupMatchResult,
  type GroupPlayoffConfig,
  type GroupSchedulingConfig,
  type GroupStandingRow,
} from "@/lib/tournaments/group-stage";
import {
  isScoredMatchStatus,
  nextBracketFeederSlot,
} from "@/lib/tournaments/match-score";
import { knockoutRoundLabel } from "@/lib/torneos/bracket-labels";
import {
  notifyGroupsDrawn,
  notifyMatchReady,
  notifyTournamentFinishedCore,
} from "@/lib/notifications/tournament";

const MatchScoreSchema = z.object({
  sets: z.array(z.object({ a: z.number().int().min(0), b: z.number().int().min(0) })).min(1),
});

function groupDb(admin: ReturnType<typeof getAdminClient>) {
  return admin;
}


async function loadCategoryContext(categoryId: string, opts?: { requireConfig?: boolean }) {
  const admin = groupDb(getAdminClient());
  const { data: cat, error } = await admin
    .from("tournament_categories")
    .select("id,tournament_id,name,stage,group_playoff_config")
    .eq("id", categoryId)
    .single();
  if (error || !cat) throw new MpError("CATEGORY.NOT_FOUND", "Categoría no encontrada", 404);

  const { data: t } = await admin
    .from("tournaments")
    .select("id,format,partner_id,scoring_config")
    .eq("id", cat.tournament_id as string)
    .single();
  if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);
  if (t.format !== "groups_to_knockout") {
    throw new MpError("GROUPS.WRONG_FORMAT", "Este torneo no usa fase de grupos", 422);
  }
  const config = cat.group_playoff_config as GroupPlayoffConfig | null;
  if (opts?.requireConfig !== false && (!config?.groupsCount || !config?.advancePerGroup)) {
    throw new MpError("GROUPS.NO_CONFIG", "Configura grupos y clasificados en la categoría", 422);
  }
  return { cat, tournament: t, config: config ?? { groupsCount: 2, advancePerGroup: 4 } };
}

async function acceptedRegistrationIds(
  admin: ReturnType<typeof groupDb>,
  tournamentId: string,
  categoryId: string,
): Promise<string[]> {
  const { data: regs } = await admin
    .from("registrations")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("category_id", categoryId)
    .eq("status", "accepted");
  return (regs ?? []).map((r) => r.id as string);
}

async function loadClubCourts(
  admin: ReturnType<typeof groupDb>,
  tournamentId: string,
): Promise<Array<{ id: string; label: string }>> {
  const { data: t } = await admin
    .from("tournaments")
    .select("club_id")
    .eq("id", tournamentId)
    .maybeSingle();
  const clubId = (t?.club_id as string | null) ?? null;
  if (!clubId) return [];
  const { data: courts } = await admin
    .from("courts")
    .select("id,code,name,ordinal")
    .eq("club_id", clubId)
    .eq("active", true)
    .order("ordinal", { ascending: true });
  return (courts ?? []).map((c) => ({
    id: c.id as string,
    label: ((c.code as string | null) || (c.name as string | null) || "Cancha") as string,
  }));
}

function waveMapFromSchedule(
  groups: GroupStageSummary["groups"],
  scheduling: ReturnType<typeof normalizeSchedulingConfig>,
): Map<string, number> {
  if (!scheduling) return new Map();
  const toSchedule: MatchToSchedule[] = [];
  for (const g of groups) {
    for (const m of g.matches) {
      toSchedule.push({
        id: m.id,
        roundNo: m.roundNo,
        groupSortOrder: g.sortOrder,
        matchNo: m.matchNo,
      });
    }
  }
  return new Map(buildGroupCourtSchedule(toSchedule, scheduling).map((s) => [s.id, s.waveNo]));
}

async function applyCourtSchedule(
  db: ReturnType<typeof groupDb>,
  groups: Array<{ id: string; sortOrder: number }>,
  scheduling: GroupSchedulingConfig,
): Promise<number> {
  const normalized = normalizeSchedulingConfig(scheduling);
  if (!normalized) return 0;

  const toSchedule: MatchToSchedule[] = [];
  for (const g of groups) {
    const { data: matches } = await db
      .from("tournament_group_matches")
      .select("id,round_no,match_no")
      .eq("group_id", g.id);
    for (const m of matches ?? []) {
      toSchedule.push({
        id: m.id as string,
        roundNo: m.round_no as number,
        groupSortOrder: g.sortOrder,
        matchNo: m.match_no as number,
      });
    }
  }

  const slots = buildGroupCourtSchedule(toSchedule, normalized);
  const waveById = new Map(slots.map((s) => [s.id, s.waveNo]));

  await Promise.all(
    slots.map((slot) =>
      db
        .from("tournament_group_matches")
        .update({ court_id: slot.courtId, scheduled_at: slot.scheduledAt } as never)
        .eq("id", slot.id),
    ),
  );

  return waveById.size;
}

function mapGroupMatch(row: Record<string, unknown>): GroupMatchResult {
  return {
    sideARegistrationId: row.side_a_registration_id as string,
    sideBRegistrationId: row.side_b_registration_id as string,
    winnerSide: (row.winner_side as "a" | "b" | "d" | null) ?? null,
    score: (row.score as GroupMatchResult["score"]) ?? null,
    status: row.status as string,
  };
}

export type GroupStageSummary = {
  categoryId: string;
  categoryName: string;
  stage: string;
  acceptedCount: number;
  config: GroupPlayoffConfig;
  courts: Array<{ id: string; label: string }>;
  groups: Array<{
    id: string;
    name: string;
    sortOrder: number;
    members: Array<{ registrationId: string; sortOrder: number }>;
    standings: GroupStandingRow[];
    matches: Array<{
      id: string;
      roundNo: number;
      matchNo: number;
      sideARegistrationId: string;
      sideBRegistrationId: string;
      status: string;
      winnerSide: string | null;
      score: unknown;
      courtId: string | null;
      scheduledAt: string | null;
      waveNo: number | null;
    }>;
  }>;
};

const GetGroupStageSchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema,
});

export async function getGroupStageSummary(
  input: unknown,
): Promise<ActionResult<GroupStageSummary>> {
  return runAction(GetGroupStageSchema, input, async ({ tournamentId, categoryId }) => {
    await requireTournamentEditor(tournamentId);
    const { cat, config } = await loadCategoryContext(categoryId, { requireConfig: false });

    const db = groupDb(getAdminClient());
    const { data: groupsRaw } = await db
      .from("tournament_groups")
      .select("id,name,sort_order")
      .eq("category_id", categoryId)
      .order("sort_order");

    if ((cat.tournament_id as string) !== tournamentId) {
      throw new MpError("CATEGORY.NOT_FOUND", "Categoría no pertenece al torneo", 404);
    }

    const groups: GroupStageSummary["groups"] = [];
    const regIds = await acceptedRegistrationIds(db, tournamentId, categoryId);
    const courts = await loadClubCourts(db, tournamentId);

    for (const g of groupsRaw ?? []) {
      const groupId = g.id as string;
      const sortOrder = g.sort_order as number;
      const [{ data: members }, { data: matches }] = await Promise.all([
        db
          .from("tournament_group_members")
          .select("registration_id,sort_order")
          .eq("group_id", groupId)
          .order("sort_order"),
        db
          .from("tournament_group_matches")
          .select("*")
          .eq("group_id", groupId)
          .order("round_no")
          .order("match_no"),
      ]);
      const memberIds = (members ?? []).map((m) => m.registration_id as string);
      const matchResults = (matches ?? []).map((m) => mapGroupMatch(m as Record<string, unknown>));
      groups.push({
        id: groupId,
        name: g.name as string,
        sortOrder,
        members: (members ?? []).map((m) => ({
          registrationId: m.registration_id as string,
          sortOrder: m.sort_order as number,
        })),
        standings: computeGroupStandings(memberIds, matchResults),
        matches: (matches ?? []).map((m) => ({
          id: m.id as string,
          roundNo: m.round_no as number,
          matchNo: m.match_no as number,
          sideARegistrationId: m.side_a_registration_id as string,
          sideBRegistrationId: m.side_b_registration_id as string,
          status: m.status as string,
          winnerSide: (m.winner_side as string | null) ?? null,
          score: m.score,
          courtId: (m.court_id as string | null) ?? null,
          scheduledAt: (m.scheduled_at as string | null) ?? null,
          waveNo: null,
        })),
      });
    }

    const scheduling = normalizeSchedulingConfig(config.scheduling);
    const waves = waveMapFromSchedule(groups, scheduling);
    for (const g of groups) {
      g.matches = g.matches.map((m) => ({
        ...m,
        waveNo: waves.get(m.id) ?? null,
      }));
    }

    return {
      categoryId,
      categoryName: cat.name as string,
      stage: (cat.stage as string) ?? "pending_groups",
      acceptedCount: regIds.length,
      config,
      courts,
      groups,
    };
  });
}

const DrawGroupsSchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema,
});

/** Sorteo aleatorio + calendario RR por grupo. */
export async function drawTournamentGroups(
  input: unknown,
): Promise<ActionResult<{ groupsCreated: number; matchesCreated: number }>> {
  return runAction(DrawGroupsSchema, input, async ({ tournamentId, categoryId }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const { cat, config } = await loadCategoryContext(categoryId);
    if ((cat.tournament_id as string) !== tournamentId) {
      throw new MpError("CATEGORY.NOT_FOUND", "Categoría no pertenece al torneo", 404);
    }
    const stage = cat.stage as string;
    if (stage !== "pending_groups") {
      throw new MpError("GROUPS.ALREADY_DRAWN", "Los grupos ya fueron sorteados", 409);
    }

    const db = groupDb(getAdminClient());
    const regIds = await acceptedRegistrationIds(db, tournamentId, categoryId);
    const err = validateGroupPlayoffConfig(config, regIds.length);
    if (err) throw new MpError("GROUPS.INVALID_CONFIG", err, 422);

    const buckets = distributeToGroups(regIds, config.groupsCount);
    await setAuditActor(getAdminClient(), editor.userId, auditActorRole(editor.actorRole));

    let matchesCreated = 0;
    const createdGroups: Array<{ id: string; sortOrder: number }> = [];
    for (let i = 0; i < buckets.length; i++) {
      const memberIds = buckets[i];
      if (memberIds.length === 0) continue;

      const { data: groupRow, error: gErr } = await db
        .from("tournament_groups")
        .insert({
          category_id: categoryId,
          name: groupLabel(i),
          sort_order: i,
        } as never)
        .select("id")
        .single();
      if (gErr) throw new MpError("GROUPS.CREATE_FAILED", gErr.message, 500);
      const groupId = groupRow.id as string;
      createdGroups.push({ id: groupId, sortOrder: i });

      const memberRows = memberIds.map((registrationId, sortOrder) => ({
        group_id: groupId,
        registration_id: registrationId,
        sort_order: sortOrder,
      }));
      const { error: mErr } = await db.from("tournament_group_members").insert(memberRows as never);
      if (mErr) throw new MpError("GROUPS.MEMBERS_FAILED", mErr.message, 500);

      const rounds = buildRoundRobinRounds(memberIds);
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
      if (matchRows.length > 0) {
        const { error: gmErr } = await db.from("tournament_group_matches").insert(matchRows as never);
        if (gmErr) throw new MpError("GROUPS.MATCHES_FAILED", gmErr.message, 500);
        matchesCreated += matchRows.length;
      }
    }

    if (config.scheduling?.courtIds?.length) {
      await applyCourtSchedule(db, createdGroups, config.scheduling);
    }

    const { error: stErr } = await db
      .from("tournament_categories")
      .update({ stage: "group_stage" } as never)
      .eq("id", categoryId);
    if (stErr) throw new MpError("GROUPS.STAGE_FAILED", stErr.message, 500);

    void notifyGroupsDrawn(getAdminClient(), { tournamentId, categoryId });

    return { groupsCreated: buckets.filter((b) => b.length > 0).length, matchesCreated };
  });
}

const ReportGroupMatchSchema = z.object({
  tournamentId: UuidSchema,
  matchId: UuidSchema,
  winnerSide: z.enum(["a", "b"]),
  score: MatchScoreSchema,
});

export async function reportGroupMatch(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(ReportGroupMatchSchema, input, async ({ tournamentId, matchId, winnerSide, score }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const gdb = groupDb(getAdminClient());

    const { data: match } = await gdb
      .from("tournament_group_matches")
      .select("id,group_id,status,side_a_registration_id,side_b_registration_id")
      .eq("id", matchId)
      .single();
    if (!match) throw new MpError("GROUPS.MATCH_NOT_FOUND", "Partido no encontrado", 404);

    const { data: group } = await gdb
      .from("tournament_groups")
      .select("category_id")
      .eq("id", match.group_id as string)
      .single();
    if (!group) throw new MpError("GROUPS.NOT_FOUND", "Grupo no encontrado", 404);

    const { cat } = await loadCategoryContext(group.category_id as string);
    if ((cat.tournament_id as string) !== tournamentId) {
      throw new MpError("GROUPS.MATCH_NOT_FOUND", "Partido no pertenece al torneo", 404);
    }
    if ((cat.stage as string) !== "group_stage") {
      throw new MpError("GROUPS.STAGE_CLOSED", "La fase de grupos ya está cerrada", 409);
    }

    await setAuditActor(getAdminClient(), editor.userId, auditActorRole(editor.actorRole));
    const { error } = await gdb
      .from("tournament_group_matches")
      .update({
        winner_side: winnerSide,
        score,
        status: "reported",
      } as never)
      .eq("id", matchId);
    if (error) throw new MpError("GROUPS.REPORT_FAILED", error.message, 500);
    return { id: matchId };
  });
}

const CorrectGroupMatchSchema = ReportGroupMatchSchema;

/** Corrige un marcador ya reportado en fase de grupos (recalcula tabla). */
export async function correctGroupMatch(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(CorrectGroupMatchSchema, input, async ({ tournamentId, matchId, winnerSide, score }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const gdb = groupDb(getAdminClient());

    const { data: match } = await gdb
      .from("tournament_group_matches")
      .select("id,group_id,status,side_a_registration_id,side_b_registration_id")
      .eq("id", matchId)
      .single();
    if (!match) throw new MpError("GROUPS.MATCH_NOT_FOUND", "Partido no encontrado", 404);
    if (!isScoredMatchStatus(match.status as string)) {
      throw new MpError("GROUPS.NOT_SCORED", "Este partido aún no tiene marcador para corregir", 409);
    }

    const { data: group } = await gdb
      .from("tournament_groups")
      .select("category_id")
      .eq("id", match.group_id as string)
      .single();
    if (!group) throw new MpError("GROUPS.NOT_FOUND", "Grupo no encontrado", 404);

    const { cat } = await loadCategoryContext(group.category_id as string);
    if ((cat.tournament_id as string) !== tournamentId) {
      throw new MpError("GROUPS.MATCH_NOT_FOUND", "Partido no pertenece al torneo", 404);
    }
    if ((cat.stage as string) !== "group_stage") {
      throw new MpError("GROUPS.STAGE_CLOSED", "La fase de grupos ya está cerrada", 409);
    }

    await setAuditActor(getAdminClient(), editor.userId, auditActorRole(editor.actorRole));
    const { error } = await gdb
      .from("tournament_group_matches")
      .update({
        winner_side: winnerSide,
        score,
        status: "reported",
      } as never)
      .eq("id", matchId);
    if (error) throw new MpError("GROUPS.CORRECT_FAILED", error.message, 500);
    return { id: matchId };
  });
}

const ConfirmGroupMatchSchema = z.object({
  tournamentId: UuidSchema,
  matchId: UuidSchema,
});

/** Confirma un marcador reportado (verificación partner / mesa). */
export async function confirmGroupMatch(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(ConfirmGroupMatchSchema, input, async ({ tournamentId, matchId }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const gdb = groupDb(getAdminClient());

    const { data: match } = await gdb
      .from("tournament_group_matches")
      .select("id,group_id,status")
      .eq("id", matchId)
      .single();
    if (!match) throw new MpError("GROUPS.MATCH_NOT_FOUND", "Partido no encontrado", 404);
    if ((match.status as string) !== "reported") {
      throw new MpError(
        "GROUPS.NOT_REPORTED",
        "Solo puedes confirmar partidos con marcador reportado",
        409,
      );
    }

    const { data: group } = await gdb
      .from("tournament_groups")
      .select("category_id")
      .eq("id", match.group_id as string)
      .single();
    if (!group) throw new MpError("GROUPS.NOT_FOUND", "Grupo no encontrado", 404);

    const { cat } = await loadCategoryContext(group.category_id as string);
    if ((cat.tournament_id as string) !== tournamentId) {
      throw new MpError("GROUPS.MATCH_NOT_FOUND", "Partido no pertenece al torneo", 404);
    }
    if ((cat.stage as string) !== "group_stage") {
      throw new MpError("GROUPS.STAGE_CLOSED", "La fase de grupos ya está cerrada", 409);
    }

    await setAuditActor(getAdminClient(), editor.userId, auditActorRole(editor.actorRole));
    const { error } = await gdb
      .from("tournament_group_matches")
      .update({ status: "confirmed" } as never)
      .eq("id", matchId);
    if (error) throw new MpError("GROUPS.CONFIRM_FAILED", error.message, 500);
    return { id: matchId };
  });
}

const CloseGroupStageSchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema,
});

export async function closeGroupStage(
  input: unknown,
): Promise<ActionResult<{ qualifiedCount: number }>> {
  return runAction(CloseGroupStageSchema, input, async ({ tournamentId, categoryId }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const { cat, config } = await loadCategoryContext(categoryId);
    if ((cat.tournament_id as string) !== tournamentId) {
      throw new MpError("CATEGORY.NOT_FOUND", "Categoría no pertenece al torneo", 404);
    }
    if ((cat.stage as string) !== "group_stage") {
      throw new MpError("GROUPS.WRONG_STAGE", "La categoría no está en fase de grupos", 409);
    }

    const summary = await getGroupStageSummary({ tournamentId, categoryId });
    if (!summary.ok) throw new MpError("GROUPS.LOAD_FAILED", summary.error.message, 500);

    for (const g of summary.data.groups) {
      const expectedMatches =
        (g.members.length * (g.members.length - 1)) / 2;
      const played = g.matches.filter((m) => m.status === "confirmed").length;
      if (played < expectedMatches) {
        throw new MpError(
          "GROUPS.INCOMPLETE",
          `Grupo ${g.name}: faltan confirmaciones (${played}/${expectedMatches} partidos)`,
          422,
        );
      }
    }

    const qualified = pickAllQualifiers(
      summary.data.groups.map((g) => ({
        id: g.id,
        name: g.name,
        sortOrder: g.sortOrder,
        memberIds: g.members.map((m) => m.registrationId),
        matches: g.matches.map((m) => ({
          sideARegistrationId: m.sideARegistrationId,
          sideBRegistrationId: m.sideBRegistrationId,
          winnerSide: (m.winnerSide as "a" | "b" | "d" | null) ?? null,
          score: (m.score as GroupMatchResult["score"]) ?? null,
          status: m.status,
        })),
      })),
      config,
    );
    if (qualified.length < 2) {
      throw new MpError("GROUPS.NOT_ENOUGH_QUALIFIED", "Se necesitan al menos 2 clasificados", 422);
    }

    await setAuditActor(getAdminClient(), editor.userId, auditActorRole(editor.actorRole));
    const db = groupDb(getAdminClient());
    const { error } = await db
      .from("tournament_categories")
      .update({ stage: "group_complete" } as never)
      .eq("id", categoryId);
    if (error) throw new MpError("GROUPS.STAGE_FAILED", error.message, 500);
    return { qualifiedCount: qualified.length };
  });
}

const GenerateKnockoutSchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema,
});

function mapGroupsForQualifiers(
  groups: Array<{
    id: string;
    name: string;
    sortOrder: number;
    members: Array<{ registrationId: string }>;
    matches: Array<{
      sideARegistrationId: string;
      sideBRegistrationId: string;
      winnerSide: string | null;
      score: unknown;
      status: string;
    }>;
  }>,
): Array<{
  id: string;
  name: string;
  sortOrder: number;
  memberIds: string[];
  matches: GroupMatchResult[];
}> {
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    sortOrder: g.sortOrder,
    memberIds: g.members.map((m) => m.registrationId),
    matches: g.matches.map((m) => ({
      sideARegistrationId: m.sideARegistrationId,
      sideBRegistrationId: m.sideBRegistrationId,
      winnerSide: (m.winnerSide as "a" | "b" | "d" | null) ?? null,
      score: (m.score as GroupMatchResult["score"]) ?? null,
      status: m.status,
    })),
  }));
}

async function feedBronzeMatchLoser(
  admin: ReturnType<typeof getAdminClient>,
  tournamentId: string,
  bracketId: string,
  loserRegId: string,
): Promise<void> {
  const { data: bronze } = await admin
    .from("bracket_matches")
    .select("id,side_a_registration_id,side_b_registration_id")
    .eq("bracket_id", bracketId)
    .eq("is_bronze" as never, true)
    .maybeSingle();
  if (!bronze) return;
  const patch: Record<string, unknown> = {};
  if (!bronze.side_a_registration_id) patch.side_a_registration_id = loserRegId;
  else if (!bronze.side_b_registration_id) patch.side_b_registration_id = loserRegId;
  else return;
  await admin.from("bracket_matches").update(patch as never).eq("id", bronze.id as string);

  // Si este perdedor completa el partido de bronce, avisar a ambos lados.
  const otherSlot = (patch.side_a_registration_id
    ? bronze.side_b_registration_id
    : bronze.side_a_registration_id) as string | null;
  if (otherSlot) {
    void notifyMatchReady(admin, {
      tournamentId,
      registrationIds: [loserRegId, otherSlot],
      matchType: "bracket",
      matchId: bronze.id as string,
    });
  }
}

/** Genera cuadro eliminatorio desde clasificados de grupos. */
export async function generateKnockoutFromGroups(
  input: unknown,
): Promise<ActionResult<{ bracketId: string; size: number }>> {
  return runAction(GenerateKnockoutSchema, input, async ({ tournamentId, categoryId }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const { cat, config } = await loadCategoryContext(categoryId);
    if ((cat.tournament_id as string) !== tournamentId) {
      throw new MpError("CATEGORY.NOT_FOUND", "Categoría no pertenece al torneo", 404);
    }
    if ((cat.stage as string) !== "group_complete") {
      throw new MpError("GROUPS.WRONG_STAGE", "Cierra la fase de grupos antes de generar la llave", 409);
    }

    const db = groupDb(getAdminClient());
    const { data: existing } = await db
      .from("brackets")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("category_id", categoryId)
      .maybeSingle();
    if (existing) throw new MpError("BRACKETS.ALREADY_EXISTS", "Ya existe un cuadro para esta categoría", 409);

    const summary = await getGroupStageSummary({ tournamentId, categoryId });
    if (!summary.ok) throw new MpError("GROUPS.LOAD_FAILED", summary.error.message, 500);

    const qualified = pickAllQualifiers(mapGroupsForQualifiers(summary.data.groups), config);

    const ranked = rankQualifiersGlobally(qualified);
    const size = nextPowerOfTwo(ranked.length);
    const useCrossGroup =
      wildcardCount(config) === 0 &&
      config.advancePerGroup >= 2 &&
      config.groupsCount >= 2;
    const firstRoundPairs = useCrossGroup
      ? crossGroupFirstRound(qualified, config.groupsCount, config.advancePerGroup)
      : standardBracketPairings(size).map(([s1, s2]) => {
          const seeds: Array<string | null> = ranked.map((e) => e.registrationId);
          while (seeds.length < size) seeds.push(null);
          return [seeds[s1 - 1] ?? null, seeds[s2 - 1] ?? null] as [string | null, string | null];
        });

    while (firstRoundPairs.length < size / 2) {
      firstRoundPairs.push([null, null]);
    }

    await setAuditActor(getAdminClient(), editor.userId, auditActorRole(editor.actorRole));
    const { data: bracketRow, error: bErr } = await db
      .from("brackets")
      .insert({
        tournament_id: tournamentId,
        category_id: categoryId,
        format: "single_elim",
        size,
        generated_by: editor.userId,
      } as never)
      .select("id")
      .single();
    if (bErr) throw new MpError("BRACKETS.CREATE_FAILED", bErr.message, 500);
    const bracketId = bracketRow.id as string;

    const matches: Record<string, unknown>[] = [];
    const numRounds = Math.log2(size);
    for (let round = 1; round <= numRounds; round++) {
      const count = size / Math.pow(2, round);
      for (let pos = 0; pos < count; pos++) {
        const m: Record<string, unknown> = {
          bracket_id: bracketId,
          round,
          position: pos,
          status: "scheduled",
        };
        if (round === 1 && firstRoundPairs[pos]) {
          m.side_a_registration_id = firstRoundPairs[pos][0];
          m.side_b_registration_id = firstRoundPairs[pos][1];
        }
        matches.push(m);
      }
    }

    if (config.knockoutExtras?.thirdPlaceMatch && size >= 4) {
      matches.push({
        bracket_id: bracketId,
        round: 0,
        position: 0,
        status: "scheduled",
        is_bronze: true,
      });
    }

    const { data: insertedMatches, error: mErr } = await db
      .from("bracket_matches")
      .insert(matches as never)
      .select("id, round, is_bronze, side_a_registration_id, side_b_registration_id");
    if (mErr) throw new MpError("BRACKETS.MATCHES_FAILED", mErr.message, 500);

    const { error: stErr } = await db
      .from("tournament_categories")
      .update({ stage: "knockout" } as never)
      .eq("id", categoryId);
    if (stErr) throw new MpError("GROUPS.STAGE_FAILED", stErr.message, 500);

    // "Te toca jugar" para los partidos de ronda 1 con ambos lados definidos.
    const admin = getAdminClient();
    for (const m of (insertedMatches ?? []) as Array<{ id: string; round: number; is_bronze: boolean | null; side_a_registration_id: string | null; side_b_registration_id: string | null }>) {
      if (m.round !== 1 || m.is_bronze) continue;
      if (!m.side_a_registration_id || !m.side_b_registration_id) continue;
      void notifyMatchReady(admin, {
        tournamentId,
        registrationIds: [m.side_a_registration_id, m.side_b_registration_id],
        matchType: "bracket",
        matchId: m.id,
      });
    }

    return { bracketId, size };
  });
}

const ReportBracketMatchSchema = z.object({
  tournamentId: UuidSchema,
  matchId: UuidSchema,
  winnerSide: z.enum(["a", "b"]),
  score: MatchScoreSchema,
});

/** Reporta resultado en eliminatoria y avanza ganador a la siguiente ronda. */
export async function reportBracketMatch(
  input: unknown,
): Promise<ActionResult<{ id: string; advanced: boolean }>> {
  return runAction(ReportBracketMatchSchema, input, async ({ tournamentId, matchId, winnerSide, score }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();

    const { data: matchRaw } = await admin
      .from("bracket_matches")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(
        "id,bracket_id,round,position,side_a_registration_id,side_b_registration_id,status,is_bronze" as any,
      )
      .eq("id", matchId)
      .single();
    const match = matchRaw as unknown as {
      id: string;
      bracket_id: string;
      round: number;
      position: number;
      side_a_registration_id: string | null;
      side_b_registration_id: string | null;
      status: string;
      is_bronze?: boolean;
    } | null;
    if (!match) throw new MpError("BRACKETS.MATCH_NOT_FOUND", "Partido no encontrado", 404);

    const { data: bracket } = await admin
      .from("brackets")
      .select("id,tournament_id,category_id,size")
      .eq("id", match.bracket_id as string)
      .single();
    if (!bracket || (bracket.tournament_id as string) !== tournamentId) {
      throw new MpError("BRACKETS.MATCH_NOT_FOUND", "Partido no pertenece al torneo", 404);
    }

    const winnerRegId =
      winnerSide === "a"
        ? (match.side_a_registration_id as string | null)
        : (match.side_b_registration_id as string | null);
    if (!winnerRegId) {
      throw new MpError("BRACKETS.NO_SIDE", "No hay inscripción en el lado ganador", 422);
    }

    await setAuditActor(admin, editor.userId, auditActorRole(editor.actorRole));
    const { error: upErr } = await admin
      .from("bracket_matches")
      .update({ winner_side: winnerSide, score, status: "reported" } as never)
      .eq("id", matchId);
    if (upErr) throw new MpError("BRACKETS.REPORT_FAILED", upErr.message, 500);

    const round = match.round as number;
    const position = match.position as number;
    const size = bracket.size as number;
    const numRounds = Math.log2(size);
    const isBronze = (match.is_bronze as boolean | null) ?? false;
    let advanced = false;

    if (!isBronze && round < numRounds) {
      const nextRound = round + 1;
      const nextPos = Math.floor(position / 2);
      const isSideA = position % 2 === 0;
      const patch: Record<string, unknown> = {};
      if (isSideA) patch.side_a_registration_id = winnerRegId;
      else patch.side_b_registration_id = winnerRegId;

      // Pre-leer el siguiente slot para saber si este avance lo completa.
      const { data: nextBefore } = await admin
        .from("bracket_matches")
        .select("id, side_a_registration_id, side_b_registration_id")
        .eq("bracket_id", bracket.id as string)
        .eq("round", nextRound)
        .eq("position", nextPos)
        .maybeSingle();

      const { error: advErr } = await admin
        .from("bracket_matches")
        .update(patch as never)
        .eq("bracket_id", bracket.id as string)
        .eq("round", nextRound)
        .eq("position", nextPos);
      if (advErr) throw new MpError("BRACKETS.ADVANCE_FAILED", advErr.message, 500);
      advanced = true;

      if (nextBefore) {
        const prevOwnSlot = (isSideA
          ? nextBefore.side_a_registration_id
          : nextBefore.side_b_registration_id) as string | null;
        const otherSlot = (isSideA
          ? nextBefore.side_b_registration_id
          : nextBefore.side_a_registration_id) as string | null;
        // Solo cuando el rival ya estaba definido y este slot recién se llena.
        if (otherSlot && prevOwnSlot !== winnerRegId) {
          void notifyMatchReady(admin, {
            tournamentId,
            registrationIds: [winnerRegId, otherSlot],
            matchType: "bracket",
            matchId: nextBefore.id as string,
          });
        }
      }

      if (round === numRounds - 1 && bracket.category_id) {
        const { data: catRow } = await admin
          .from("tournament_categories")
          .select("group_playoff_config")
          .eq("id", bracket.category_id as string)
          .maybeSingle();
        const cfg = catRow?.group_playoff_config as GroupPlayoffConfig | null;
        if (cfg?.knockoutExtras?.thirdPlaceMatch) {
          const loserRegId =
            winnerSide === "a"
              ? (match.side_b_registration_id as string | null)
              : (match.side_a_registration_id as string | null);
          if (loserRegId) {
            await feedBronzeMatchLoser(admin, tournamentId, bracket.id as string, loserRegId);
          }
        }
      }
    } else if (!isBronze && round === numRounds) {
      if (bracket.category_id) {
        await groupDb(getAdminClient())
          .from("tournament_categories")
          .update({ stage: "complete" } as never)
          .eq("id", bracket.category_id as string);

        const { data: allCats } = await groupDb(getAdminClient())
          .from("tournament_categories")
          .select("stage")
          .eq("tournament_id", tournamentId);
        const allComplete = (allCats ?? []).length > 0 &&
          (allCats ?? []).every((c) => (c.stage as string | null) === "complete");
        if (allComplete) {
          await groupDb(getAdminClient())
            .from("tournaments")
            .update({ status: "finished" } as never)
            .eq("id", tournamentId);
          await notifyTournamentFinishedCore(admin, tournamentId);
        }
      } else {
        await groupDb(getAdminClient())
          .from("tournaments")
          .update({ status: "finished" } as never)
          .eq("id", tournamentId);
        await notifyTournamentFinishedCore(admin, tournamentId);
      }
    }

    return { id: matchId, advanced };
  });
}

const CorrectBracketMatchSchema = ReportBracketMatchSchema;

/** Corrige marcador en eliminatoria. Bloquea si la ronda siguiente ya tiene resultado. */
export async function correctBracketMatch(
  input: unknown,
): Promise<ActionResult<{ id: string; advanced: boolean }>> {
  return runAction(CorrectBracketMatchSchema, input, async ({ tournamentId, matchId, winnerSide, score }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();

    const { data: match } = await admin
      .from("bracket_matches")
      .select(
        "id,bracket_id,round,position,side_a_registration_id,side_b_registration_id,status,winner_side",
      )
      .eq("id", matchId)
      .single();
    if (!match) throw new MpError("BRACKETS.MATCH_NOT_FOUND", "Partido no encontrado", 404);
    if (!isScoredMatchStatus(match.status as string)) {
      throw new MpError("BRACKETS.NOT_SCORED", "Este partido aún no tiene marcador para corregir", 409);
    }

    const { data: bracket } = await admin
      .from("brackets")
      .select("id,tournament_id,category_id,size")
      .eq("id", match.bracket_id as string)
      .single();
    if (!bracket || (bracket.tournament_id as string) !== tournamentId) {
      throw new MpError("BRACKETS.MATCH_NOT_FOUND", "Partido no pertenece al torneo", 404);
    }

    if (bracket.category_id) {
      const { data: cat } = await admin
        .from("tournament_categories")
        .select("stage")
        .eq("id", bracket.category_id as string)
        .single();
      const stage = cat?.stage as string | undefined;
      if (stage && stage !== "knockout" && stage !== "complete") {
        throw new MpError("BRACKETS.STAGE_CLOSED", "La eliminatoria no está activa", 409);
      }
    }

    const round = match.round as number;
    const position = match.position as number;
    const size = bracket.size as number;
    const numRounds = Math.log2(size);

    const oldWinnerSide = match.winner_side as "a" | "b" | null;
    const oldWinnerRegId =
      oldWinnerSide === "a"
        ? (match.side_a_registration_id as string | null)
        : oldWinnerSide === "b"
          ? (match.side_b_registration_id as string | null)
          : null;
    const newWinnerRegId =
      winnerSide === "a"
        ? (match.side_a_registration_id as string | null)
        : (match.side_b_registration_id as string | null);
    if (!newWinnerRegId) {
      throw new MpError("BRACKETS.NO_SIDE", "No hay inscripción en el lado ganador", 422);
    }

    let advanced = false;

    if (round < numRounds) {
      const { nextRound, nextPos, feederSide } = nextBracketFeederSlot(round, position);
      const { data: nextMatch } = await admin
        .from("bracket_matches")
        .select("id,status,side_a_registration_id,side_b_registration_id")
        .eq("bracket_id", bracket.id as string)
        .eq("round", nextRound)
        .eq("position", nextPos)
        .maybeSingle();

      if (nextMatch && isScoredMatchStatus(nextMatch.status as string)) {
        const roundLabel = knockoutRoundLabel(nextRound - 1, numRounds);
        throw new MpError(
          "BRACKETS.NEXT_ROUND_SCORED",
          `Corrige primero el partido de ${roundLabel} antes de cambiar este marcador.`,
          409,
        );
      }

      if (nextMatch && oldWinnerRegId !== newWinnerRegId) {
        const patch: Record<string, unknown> = {};
        if (feederSide === "a") patch.side_a_registration_id = newWinnerRegId;
        else patch.side_b_registration_id = newWinnerRegId;

        const { error: advErr } = await admin
          .from("bracket_matches")
          .update(patch as never)
          .eq("id", nextMatch.id as string);
        if (advErr) throw new MpError("BRACKETS.ADVANCE_FAILED", advErr.message, 500);
        advanced = true;

        const otherSlot = (feederSide === "a"
          ? nextMatch.side_b_registration_id
          : nextMatch.side_a_registration_id) as string | null;
        if (otherSlot) {
          void notifyMatchReady(admin, {
            tournamentId,
            registrationIds: [newWinnerRegId, otherSlot],
            matchType: "bracket",
            matchId: nextMatch.id as string,
          });
        }
      }
    }

    await setAuditActor(admin, editor.userId, auditActorRole(editor.actorRole));
    const { error: upErr } = await admin
      .from("bracket_matches")
      .update({ winner_side: winnerSide, score, status: "reported" } as never)
      .eq("id", matchId);
    if (upErr) throw new MpError("BRACKETS.CORRECT_FAILED", upErr.message, 500);

    return { id: matchId, advanced };
  });
}

export async function updateCategoryGroupConfig(
  input: unknown,
): Promise<ActionResult<{ categoryId: string }>> {
  return runAction(
    z.object({
      tournamentId: UuidSchema,
      categoryId: UuidSchema,
      config: GroupPlayoffConfigSchema,
    }),
    input,
    async ({ tournamentId, categoryId, config }) => {
      const editor = await requireTournamentEditor(tournamentId);
      const { cat } = await loadCategoryContext(categoryId, { requireConfig: false });
      if ((cat.tournament_id as string) !== tournamentId) {
        throw new MpError("CATEGORY.NOT_FOUND", "Categoría no pertenece al torneo", 404);
      }
      if ((cat.stage as string) !== "pending_groups") {
        const oldCfg = cat.group_playoff_config as GroupPlayoffConfig | null;
        if (
          (config.groupsCount ?? 0) !== (oldCfg?.groupsCount ?? 0) ||
          (config.advancePerGroup ?? 0) !== (oldCfg?.advancePerGroup ?? 0)
        ) {
          throw new MpError(
            "GROUPS.CONFIG_LOCKED",
            "El número de grupos y clasificados no se puede cambiar tras el sorteo",
            409,
          );
        }
      }
      const db = groupDb(getAdminClient());
      const regIds = await acceptedRegistrationIds(db, tournamentId, categoryId);
      const err = validateGroupPlayoffConfig(config, regIds.length || 1);
      if (err) throw new MpError("GROUPS.INVALID_CONFIG", err, 422);

      await setAuditActor(getAdminClient(), editor.userId, auditActorRole(editor.actorRole));
      const { error } = await db
        .from("tournament_categories")
        .update({ group_playoff_config: config } as never)
        .eq("id", categoryId);
      if (error) throw new MpError("GROUPS.CONFIG_FAILED", error.message, 500);
      return { categoryId };
    },
  );
}

const SaveSchedulingSchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema,
  scheduling: GroupSchedulingConfigSchema,
});

/** Guarda canchas activas + tiempos y reprograma partidos de la categoría. */
export async function saveGroupStageScheduling(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(SaveSchedulingSchema, input, async ({ tournamentId, categoryId, scheduling }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const { cat, config } = await loadCategoryContext(categoryId, { requireConfig: false });
    if ((cat.tournament_id as string) !== tournamentId) {
      throw new MpError("CATEGORY.NOT_FOUND", "Categoría no pertenece al torneo", 404);
    }

    const clubCourts = await loadClubCourts(groupDb(getAdminClient()), tournamentId);
    const validIds = new Set(clubCourts.map((c) => c.id));
    for (const cid of scheduling.courtIds) {
      if (!validIds.has(cid)) {
        throw new MpError("GROUPS.INVALID_COURT", "Una cancha no pertenece al club del torneo", 422);
      }
    }

    const nextConfig: GroupPlayoffConfig = {
      ...config,
      scheduling,
    };

    const db = groupDb(getAdminClient());
    await setAuditActor(getAdminClient(), editor.userId, auditActorRole(editor.actorRole));

    const { error: cfgErr } = await db
      .from("tournament_categories")
      .update({ group_playoff_config: nextConfig } as never)
      .eq("id", categoryId);
    if (cfgErr) throw new MpError("GROUPS.CONFIG_FAILED", cfgErr.message, 500);

    const stage = cat.stage as string;
    if (stage !== "pending_groups") {
      const { data: groupsRaw } = await db
        .from("tournament_groups")
        .select("id,sort_order")
        .eq("category_id", categoryId);
      const groups = (groupsRaw ?? []).map((g) => ({
        id: g.id as string,
        sortOrder: g.sort_order as number,
      }));
      if (groups.length > 0) {
        await applyCourtSchedule(db, groups, scheduling);
      }
    }

    return { ok: true as const };
  });
}

// ── resetGroupDraw ─────────────────────────────────────────────────────────

const ResetGroupDrawSchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema,
});

export async function resetGroupDraw(
  input: unknown,
): Promise<ActionResult<void>> {
  return runAction(ResetGroupDrawSchema, input, async ({ tournamentId, categoryId }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = groupDb(getAdminClient());

    const { data: cat } = await admin
      .from("tournament_categories")
      .select("id, stage")
      .eq("id", categoryId)
      .eq("tournament_id", tournamentId)
      .maybeSingle();

    if (!cat) throw new MpError("TOURNAMENTS.CATEGORY_NOT_FOUND", "Categoría no encontrada", 404);

    const allowedStages = ["group_stage", "group_complete"];
    if (!allowedStages.includes(cat.stage as string)) {
      throw new MpError(
        "GROUPS.STAGE_INVALID",
        "Solo se puede reiniciar desde fase de grupos activa o cerrada",
        409,
      );
    }

    const { data: groups } = await admin
      .from("tournament_groups")
      .select("id")
      .eq("category_id", categoryId);

    if (groups && groups.length > 0) {
      const groupIds = groups.map((g) => g.id as string);

      const { count } = await admin
        .from("tournament_group_matches")
        .select("id", { count: "exact", head: true })
        .in("group_id", groupIds)
        .in("status", ["confirmed", "reported"]);

      if ((count ?? 0) > 0) {
        throw new MpError(
          "GROUPS.HAS_RESULTS",
          "No se puede reiniciar: hay partidos con resultado. Corrige o descarta primero.",
          409,
        );
      }

      await setAuditActor(admin, editor.userId, auditActorRole(editor.actorRole));

      await admin.from("tournament_group_matches").delete().in("group_id", groupIds);
      await admin.from("tournament_groups").delete().eq("category_id", categoryId);
    } else {
      await setAuditActor(admin, editor.userId, auditActorRole(editor.actorRole));
    }

    await admin
      .from("tournament_categories")
      .update({ stage: "pending_groups" } as never)
      .eq("id", categoryId);
  });
}
