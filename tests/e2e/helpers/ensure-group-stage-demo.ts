/** Torneo groups_to_knockout mínimo para smoke E2E del panel partner. */
import { getServiceClient } from "./supabase";
import { ensureDemoMobileRoles } from "./ensure-demo-mobile";
import { ensureSeed } from "./setup";

export const E2E_GROUP_STAGE_SLUG = "e2e-groups-smoke";

export type GroupStageDemo = {
  tournamentId: string;
  categoryId: string;
};

export async function ensureGroupStageDemo(): Promise<GroupStageDemo> {
  await ensureSeed();
  await ensureDemoMobileRoles();

  const sb = getServiceClient();
  const { data: partnerOrg } = await sb
    .from("partner_orgs")
    .select("id")
    .eq("slug", "e2e-mobile-partner")
    .single();
  if (!partnerOrg?.id) throw new Error("partner_org e2e-mobile-partner sin resolver");

  const seed = await ensureSeed();
  await sb.from("partner_club_links").upsert(
    { partner_id: partnerOrg.id, club_id: seed.clubId, revenue_share_pct: 0 } as never,
    { onConflict: "partner_id,club_id", ignoreDuplicates: true },
  );

  const { data: partnerUser } = await sb
    .from("partner_members")
    .select("user_id")
    .eq("partner_id", partnerOrg.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (!partnerUser?.user_id) throw new Error("partner owner sin resolver");

  const now = new Date();
  const startsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000).toISOString();

  const { data: tournament, error: tErr } = await sb
    .from("tournaments")
    .upsert(
      {
        partner_id: partnerOrg.id,
        club_id: seed.clubId,
        name: "E2E Fase de grupos",
        slug: E2E_GROUP_STAGE_SLUG,
        description: "Smoke E2E panel fase de grupos",
        sport: "pickleball",
        format: "groups_to_knockout",
        modality: "singles",
        starts_at: startsAt,
        ends_at: endsAt,
        registration_opens_at: new Date(now.getTime() - 86400000).toISOString(),
        registration_closes_at: new Date(now.getTime() + 13 * 86400000).toISOString(),
        status: "registration_open",
        max_participants: 16,
        entry_fee_cents: 0,
        currency: "USD",
        payment_policy: "free",
        prize_pool_cents: 0,
        created_by: partnerUser.user_id,
      } as never,
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (tErr || !tournament?.id) {
    throw new Error(`No se pudo upsert torneo E2E grupos: ${tErr?.message ?? "sin id"}`);
  }

  const tournamentId = tournament.id as string;

  const categoryName = "Open Singles E2E";
  const { data: existingCat } = await sb
    .from("tournament_categories")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("name", categoryName)
    .maybeSingle();

  if (existingCat?.id) {
    await sb
      .from("tournament_categories")
      .update({
        max_teams: 16,
        stage: "pending_groups",
        group_playoff_config: {
          groupsCount: 4,
          advancePerGroup: 1,
          finalScoringOverride: null,
        },
      } as never)
      .eq("id", existingCat.id);
    return { tournamentId, categoryId: existingCat.id as string };
  }

  const { data: category, error: cErr } = await sb
    .from("tournament_categories")
    .insert({
      tournament_id: tournamentId,
      name: categoryName,
      gender: "open",
      max_teams: 16,
      stage: "pending_groups",
      group_playoff_config: {
        groupsCount: 4,
        advancePerGroup: 1,
        finalScoringOverride: null,
      },
    } as never)
    .select("id")
    .single();

  if (cErr || !category?.id) {
    throw new Error(`Categoría E2E grupos sin resolver: ${cErr?.message ?? "sin fila"}`);
  }

  return { tournamentId, categoryId: category.id as string };
}
