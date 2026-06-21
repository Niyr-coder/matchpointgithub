/**
 * Llena el torneo demo @drews a 32 inscritos y configura top 2 por grupo.
 *
 *   npx tsx --env-file=.env.local scripts/seed-drews-demo-full-roster.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  buildRoundRobinRounds,
  distributeToGroups,
  groupLabel,
} from "../src/lib/tournaments/group-stage";
const QA_PASSWORD = "QaTest1234!";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TOURNAMENT_SLUG = "open-demo-matchpoint-jun2026";
const QA_DOMAIN = "matchpoint.test";
const TARGET = 32;
const GROUP_CONFIG = {
  groupsCount: 8,
  advancePerGroup: 2,
  finalScoringOverride: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as any;

async function patchProfile(userId: string, opts: { username: string; displayName: string }) {
  await sb
    .from("profiles")
    .update({
      username: opts.username,
      display_name: opts.displayName,
      country: "EC",
      city: "Quito",
      preferred_sport: "pickleball",
      skill_level: "intermediate",
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

async function ensureUser(email: string, username: string, displayName: string): Promise<string> {
  const { data: byUsername } = await sb.from("profiles").select("id").eq("username", username).maybeSingle();
  if (byUsername?.id) {
    await patchProfile(byUsername.id as string, { username, displayName });
    return byUsername.id as string;
  }

  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u: { email?: string }) => u.email === email);
  if (existing) {
    await patchProfile(existing.id as string, { username, displayName });
    return existing.id as string;
  }

  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: QA_PASSWORD,
    email_confirm: true,
    user_metadata: { username, display_name: displayName, locale: "es" },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);

  const id = data.user!.id as string;
  await patchProfile(id, { username, displayName });
  return id;
}

async function main() {
  if (!url || !service) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const { data: tournament, error: tErr } = await sb
    .from("tournaments")
    .select("id, slug")
    .eq("slug", TOURNAMENT_SLUG)
    .single();
  if (tErr || !tournament) {
    throw new Error(`Torneo ${TOURNAMENT_SLUG} no encontrado. Corre seed-drews-demo-tournament.sql primero.`);
  }

  const { data: category, error: cErr } = await sb
    .from("tournament_categories")
    .select("id, name")
    .eq("tournament_id", tournament.id)
    .eq("name", "Open Singles")
    .single();
  if (cErr || !category) throw new Error("Categoría Open Singles no encontrada");

  console.log("Creando jugadores demo hasta", TARGET, "...");
  const playerIds: string[] = [];

  for (let i = 1; i <= TARGET; i++) {
    const n = String(i).padStart(2, "0");
    const username = `opendemo${n}`;
    const displayName = `Open Demo ${n}`;
    const email = `open-demo-${n}@${QA_DOMAIN}`;
    const id = await ensureUser(email, username, displayName);
    playerIds.push(id);
  }

  console.log("Actualizando config fase de grupos (top 2)...");
  await sb
    .from("tournament_categories")
    .update({
      max_teams: TARGET,
      stage: "pending_groups",
      group_playoff_config: GROUP_CONFIG,
    })
    .eq("id", category.id);

  await sb.from("tournaments").update({
    max_participants: TARGET,
    description: `Torneo demo fase de grupos (${TARGET} cupos). 8 grupos de 4, clasifica 2 por grupo.`,
  }).eq("id", tournament.id);

  console.log("Limpiando bracket y grupos previos...");
  await sb.from("brackets").delete().eq("tournament_id", tournament.id);

  const { data: groups } = await sb
    .from("tournament_groups")
    .select("id")
    .eq("category_id", category.id);
  if (groups?.length) {
    const groupIds = groups.map((g: { id: string }) => g.id);
    await sb.from("tournament_group_matches").delete().in("group_id", groupIds);
    await sb.from("tournament_group_members").delete().in("group_id", groupIds);
    await sb.from("tournament_groups").delete().eq("category_id", category.id);
  }

  console.log("Reemplazando inscripciones...");
  await sb.from("registrations").delete().eq("tournament_id", tournament.id);

  const rows = playerIds.map((playerId) => ({
    tournament_id: tournament.id,
    category_id: category.id,
    player_ids: [playerId],
    registered_by: playerId,
    status: "accepted",
  }));

  const { error: regErr } = await sb.from("registrations").insert(rows);
  if (regErr) throw new Error(`registrations: ${regErr.message}`);

  const { data: regRows, error: regFetchErr } = await sb
    .from("registrations")
    .select("id")
    .eq("tournament_id", tournament.id)
    .eq("category_id", category.id)
    .eq("status", "accepted");
  if (regFetchErr) throw new Error(`registrations fetch: ${regFetchErr.message}`);

  console.log("Sorteando 8 grupos de 4 equipos...");
  const regIds = (regRows ?? []).map((r: { id: string }) => r.id);
  const buckets = distributeToGroups(regIds, GROUP_CONFIG.groupsCount);
  let matchesCreated = 0;

  for (let i = 0; i < buckets.length; i++) {
    const memberIds = buckets[i];
    if (memberIds.length === 0) continue;

    const { data: groupRow, error: gErr } = await sb
      .from("tournament_groups")
      .insert({
        category_id: category.id,
        name: groupLabel(i),
        sort_order: i,
      })
      .select("id")
      .single();
    if (gErr) throw new Error(`group ${groupLabel(i)}: ${gErr.message}`);

    const groupId = groupRow.id as string;
    const memberRows = memberIds.map((registrationId: string, sortOrder: number) => ({
      group_id: groupId,
      registration_id: registrationId,
      sort_order: sortOrder,
    }));
    const { error: mErr } = await sb.from("tournament_group_members").insert(memberRows);
    if (mErr) throw new Error(`members ${groupLabel(i)}: ${mErr.message}`);

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
      const { error: gmErr } = await sb.from("tournament_group_matches").insert(matchRows);
      if (gmErr) throw new Error(`matches ${groupLabel(i)}: ${gmErr.message}`);
      matchesCreated += matchRows.length;
    }
  }

  await sb
    .from("tournament_categories")
    .update({ stage: "group_stage" })
    .eq("id", category.id);

  const { count } = await sb
    .from("registrations")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", tournament.id)
    .eq("status", "accepted");

  console.log("Listo:", {
    tournamentId: tournament.id,
    slug: TOURNAMENT_SLUG,
    accepted: count,
    groupConfig: GROUP_CONFIG,
    matchesCreated,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
