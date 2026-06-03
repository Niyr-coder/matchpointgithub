"use server";

/**
 * Fase de grupos + eliminatoria para torneos `groups_to_knockout`.
 * Ver docs/product/01-tournaments.md §13.
 */
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { ScoringConfigSchema } from "@/lib/schemas/tournaments";
import {
  buildRoundRobinRounds,
  computeGroupStandings,
  crossGroupFirstRound,
  distributeToGroups,
  groupLabel,
  nextPowerOfTwo,
  pickQualifiers,
  rankQualifiersGlobally,
  standardBracketPairings,
  validateGroupPlayoffConfig,
  type GroupMatchResult,
  type GroupPlayoffConfig,
  type GroupStandingRow,
} from "@/lib/tournaments/group-stage";

const GroupPlayoffConfigSchema = z.object({
  groupsCount: z.number().int().min(1).max(16),
  advancePerGroup: z.number().int().min(1).max(16),
  finalScoringOverride: ScoringConfigSchema.nullable().optional(),
});

const MatchScoreSchema = z.object({
  sets: z.array(z.object({ a: z.number().int().min(0), b: z.number().int().min(0) })).min(1),
});

function groupDb(admin: ReturnType<typeof getAdminClient>) {
  return admin;
}

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  return user.id;
}

async function requireTournamentEditor(tournamentId: string) {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data: t } = await supabase
    .from("tournaments")
    .select("partner_id")
    .eq("id", tournamentId)
    .single();
  if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

  const { data: adminRow } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  const isAdmin = !!adminRow;
  const partnerId = (t.partner_id as string | null) ?? null;
  if (isAdmin) return { userId, isAdmin, partnerId, actorRole: "admin" as const };
  if (!partnerId) throw new AuthError("AUTH.ROLE_REQUIRED", "Torneo sin partner — solo admin");
  const { data: member } = await supabase
    .from("partner_members")
    .select("user_id")
    .eq("partner_id", partnerId)
    .eq("user_id", userId)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!member) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el partner organizador o un admin");
  return { userId, isAdmin, partnerId, actorRole: "partner" as const };
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
  return (regs ?? []).map((r) => r.id);
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
  config: GroupPlayoffConfig;
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
    for (const g of groupsRaw ?? []) {
      const groupId = g.id as string;
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
        sortOrder: g.sort_order as number,
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
        })),
      });
    }

    return {
      categoryId,
      categoryName: cat.name as string,
      stage: (cat.stage as string) ?? "pending_groups",
      config,
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
    await setAuditActor(getAdminClient(), editor.userId, editor.actorRole);

    let matchesCreated = 0;
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

    const { error: stErr } = await db
      .from("tournament_categories")
      .update({ stage: "group_stage" } as never)
      .eq("id", categoryId);
    if (stErr) throw new MpError("GROUPS.STAGE_FAILED", stErr.message, 500);

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

    await setAuditActor(getAdminClient(), editor.userId, editor.actorRole);
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
      const played = g.matches.filter(
        (m) => m.status === "reported" || m.status === "confirmed",
      ).length;
      if (played < expectedMatches) {
        throw new MpError(
          "GROUPS.INCOMPLETE",
          `Grupo ${g.name}: faltan resultados (${played}/${expectedMatches} partidos)`,
          422,
        );
      }
    }

    const qualified = pickQualifiers(
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
      config.advancePerGroup,
    );
    if (qualified.length < 2) {
      throw new MpError("GROUPS.NOT_ENOUGH_QUALIFIED", "Se necesitan al menos 2 clasificados", 422);
    }

    await setAuditActor(getAdminClient(), editor.userId, editor.actorRole);
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

    const qualified = pickQualifiers(
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
      config.advancePerGroup,
    );

    const ranked = rankQualifiersGlobally(qualified);
    const size = nextPowerOfTwo(ranked.length);
    const firstRoundPairs =
      config.advancePerGroup >= 2 && config.groupsCount >= 2
        ? crossGroupFirstRound(qualified, config.groupsCount, config.advancePerGroup)
        : standardBracketPairings(size).map(([s1, s2]) => {
            const seeds: Array<string | null> = ranked.map((e) => e.registrationId);
            while (seeds.length < size) seeds.push(null);
            return [seeds[s1 - 1] ?? null, seeds[s2 - 1] ?? null] as [string | null, string | null];
          });

    while (firstRoundPairs.length < size / 2) {
      firstRoundPairs.push([null, null]);
    }

    await setAuditActor(getAdminClient(), editor.userId, editor.actorRole);
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

    const { error: mErr } = await db.from("bracket_matches").insert(matches as never);
    if (mErr) throw new MpError("BRACKETS.MATCHES_FAILED", mErr.message, 500);

    const { error: stErr } = await db
      .from("tournament_categories")
      .update({ stage: "knockout" } as never)
      .eq("id", categoryId);
    if (stErr) throw new MpError("GROUPS.STAGE_FAILED", stErr.message, 500);

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

    const { data: match } = await admin
      .from("bracket_matches")
      .select(
        "id,bracket_id,round,position,side_a_registration_id,side_b_registration_id,status",
      )
      .eq("id", matchId)
      .single();
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

    await setAuditActor(admin, editor.userId, editor.actorRole);
    const { error: upErr } = await admin
      .from("bracket_matches")
      .update({ winner_side: winnerSide, score, status: "reported" } as never)
      .eq("id", matchId);
    if (upErr) throw new MpError("BRACKETS.REPORT_FAILED", upErr.message, 500);

    const round = match.round as number;
    const position = match.position as number;
    const size = bracket.size as number;
    const numRounds = Math.log2(size);
    let advanced = false;

    if (round < numRounds) {
      const nextRound = round + 1;
      const nextPos = Math.floor(position / 2);
      const isSideA = position % 2 === 0;
      const patch: Record<string, unknown> = {};
      if (isSideA) patch.side_a_registration_id = winnerRegId;
      else patch.side_b_registration_id = winnerRegId;

      const { error: advErr } = await admin
        .from("bracket_matches")
        .update(patch as never)
        .eq("bracket_id", bracket.id as string)
        .eq("round", nextRound)
        .eq("position", nextPos);
      if (advErr) throw new MpError("BRACKETS.ADVANCE_FAILED", advErr.message, 500);
      advanced = true;
    } else if (bracket.category_id) {
      await groupDb(getAdminClient())
        .from("tournament_categories")
        .update({ stage: "complete" } as never)
        .eq("id", bracket.category_id as string);
    }

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
        throw new MpError("GROUPS.CONFIG_LOCKED", "No puedes cambiar la config después del sorteo", 409);
      }
      const db = groupDb(getAdminClient());
      const regIds = await acceptedRegistrationIds(db, tournamentId, categoryId);
      const err = validateGroupPlayoffConfig(config, regIds.length || 1);
      if (err) throw new MpError("GROUPS.INVALID_CONFIG", err, 422);

      await setAuditActor(getAdminClient(), editor.userId, editor.actorRole);
      const { error } = await db
        .from("tournament_categories")
        .update({ group_playoff_config: config } as never)
        .eq("id", categoryId);
      if (error) throw new MpError("GROUPS.CONFIG_FAILED", error.message, 500);
      return { categoryId };
    },
  );
}
