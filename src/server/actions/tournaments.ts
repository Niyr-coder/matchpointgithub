"use server";

// Tournaments + leagues + registrations. Bracket generation is a partner action
// that comes later (needs a seeding algorithm).
import "server-only";

import { z } from "zod";
import { headers } from "next/headers";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { withIdempotency } from "@/lib/api/idempotency";
import {
  BracketMatchSchema,
  BracketSchema,
  LeagueCreateSchema,
  LeagueSchema,
  RegistrationSchema,
  TournamentCategorySchema,
  TournamentCreateSchema,
  TournamentDetailSchema,
  TournamentFeaturedSchema,
  TournamentListParamsSchema,
  TournamentRegisterSchema,
  TournamentSchema,
  type Bracket,
  type League,
  type Registration,
  type Tournament,
  type TournamentDetail,
  type TournamentFeatured,
} from "@/lib/schemas/tournaments";
import { UuidSchema } from "@/lib/schemas/common";

function mapLeague(row: Record<string, unknown>): League {
  return LeagueSchema.parse({
    id: row.id,
    partnerId: (row.partner_id as string | null) ?? null,
    name: row.name,
    slug: row.slug,
    sport: row.sport,
    description: row.description ?? null,
    coverUrl: row.cover_url ?? null,
    season: row.season ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapTournament(row: Record<string, unknown>): Tournament {
  return TournamentSchema.parse({
    id: row.id,
    leagueId: (row.league_id as string | null) ?? null,
    partnerId: (row.partner_id as string | null) ?? null,
    clubId: (row.club_id as string | null) ?? null,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    coverUrl: row.cover_url ?? null,
    sport: row.sport,
    format: row.format,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    registrationOpensAt: (row.registration_opens_at as string | null) ?? null,
    registrationClosesAt: (row.registration_closes_at as string | null) ?? null,
    status: row.status,
    maxParticipants: (row.max_participants as number | null) ?? null,
    entryFeeCents: row.entry_fee_cents,
    currency: (row.currency as string | null) ?? null,
    prizePoolCents: (row.prize_pool_cents as number | null) ?? null,
    rulesUrl: (row.rules_url as string | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

async function requirePartnerAdmin(partnerId: string): Promise<string> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("partner_members")
    .select("role")
    .eq("partner_id", partnerId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !["owner", "admin"].includes(data.role as string)) {
    throw new AuthError("AUTH.ROLE_REQUIRED", "Partner-admin role required");
  }
  return userId;
}

// ── leagues ────────────────────────────────────────────────────────────
export async function listLeagues(): Promise<ActionResult<League[]>> {
  return runAction(z.undefined(), undefined, async () => {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("leagues")
      .select("*")
      .in("status", ["active", "finished"])
      .order("created_at", { ascending: false });
    if (error) throw new MpError("LEAGUES.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapLeague);
  });
}

export async function createLeague(input: unknown): Promise<ActionResult<League>> {
  return runAction(LeagueCreateSchema, input, async (data) => {
    const userId = await requirePartnerAdmin(data.partnerId);
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("leagues")
      .insert({
        partner_id: data.partnerId,
        name: data.name,
        slug: data.slug,
        sport: data.sport,
        description: data.description ?? null,
        season: data.season ?? null,
        status: "active",
        created_by: userId,
      } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("LEAGUES.SLUG_TAKEN", "League slug already exists", 409);
      }
      throw new MpError("LEAGUES.CREATE_FAILED", error.message, 500);
    }
    return mapLeague(row);
  });
}

// ── tournaments ────────────────────────────────────────────────────────
const FeaturedParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(3),
});

export async function listFeaturedTournaments(
  input: unknown = {},
): Promise<ActionResult<TournamentFeatured[]>> {
  return runAction(FeaturedParamsSchema, input, async ({ limit }) => {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("tournaments_public_summary")
      .select("*")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(limit);
    if (error) throw new MpError("TOURNAMENTS.DB_ERROR", error.message, 500);
    return (data ?? []).map((row) =>
      TournamentFeaturedSchema.parse({
        id: row.id,
        slug: row.slug,
        name: row.name,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        prizePoolCents: row.prize_pool_cents ?? null,
        entryFeeCents: row.entry_fee_cents ?? 0,
        currency: row.currency ?? null,
        maxParticipants: row.max_participants ?? null,
        sport: row.sport,
        format: row.format,
        status: row.status,
        clubName: row.club_name ?? null,
        clubCity: row.club_city ?? null,
        registrationsCount: row.registrations_count ?? 0,
      }),
    );
  });
}

export async function listTournaments(input: unknown): Promise<ActionResult<Tournament[]>> {
  return runAction(TournamentListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;
    let q = supabase
      .from("tournaments")
      .select("*")
      .not("status", "in", "(draft,cancelled)")
      .order("starts_at", { ascending: true })
      .range(from, to);
    if (params.leagueId) q = q.eq("league_id", params.leagueId);
    if (params.partnerId) q = q.eq("partner_id", params.partnerId);
    if (params.sport) q = q.eq("sport", params.sport);
    if (params.fromDate) q = q.gte("starts_at", params.fromDate);
    const { data, error } = await q;
    if (error) throw new MpError("TOURNAMENTS.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapTournament);
  });
}

export async function getTournament(input: unknown): Promise<ActionResult<TournamentDetail>> {
  return runAction(
    z.object({ idOrSlug: z.string() }),
    input,
    async ({ idOrSlug }) => {
      const supabase = await getServerClient();
      const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
      const q = isUuid
        ? supabase.from("tournaments").select("*").eq("id", idOrSlug).single()
        : supabase.from("tournaments").select("*").eq("slug", idOrSlug).single();
      const { data: t, error } = await q;
      if (error || !t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Tournament not found", 404);

      const [{ data: cats }, { count }] = await Promise.all([
        supabase.from("tournament_categories").select("*").eq("tournament_id", t.id),
        supabase
          .from("registrations")
          .select("*", { count: "exact", head: true })
          .eq("tournament_id", t.id)
          .in("status", ["pending", "accepted"]),
      ]);

      const detail: TournamentDetail = {
        tournament: mapTournament(t),
        categories: (cats ?? []).map((c) =>
          TournamentCategorySchema.parse({
            id: c.id,
            name: c.name,
            gender: (c.gender as TournamentDetail["categories"][number]["gender"]) ?? null,
            level: (c.level as TournamentDetail["categories"][number]["level"]) ?? null,
            ageMin: (c.age_min as number | null) ?? null,
            ageMax: (c.age_max as number | null) ?? null,
            maxTeams: (c.max_teams as number | null) ?? null,
          }),
        ),
        registrationCount: count ?? 0,
      };
      return TournamentDetailSchema.parse(detail);
    },
  );
}

export async function createTournament(input: unknown): Promise<ActionResult<Tournament>> {
  return runAction(TournamentCreateSchema, input, async (data) => {
    const userId = await requirePartnerAdmin(data.partnerId);
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("tournaments")
      .insert({
        partner_id: data.partnerId,
        league_id: data.leagueId ?? null,
        club_id: data.clubId ?? null,
        name: data.name,
        slug: data.slug,
        sport: data.sport,
        format: data.format,
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        registration_opens_at: data.registrationOpensAt ?? null,
        registration_closes_at: data.registrationClosesAt ?? null,
        status: "draft",
        max_participants: data.maxParticipants ?? null,
        entry_fee_cents: data.entryFeeCents,
        currency: data.currency ?? null,
        prize_pool_cents: data.prizePoolCents ?? null,
        created_by: userId,
      } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("TOURNAMENTS.SLUG_TAKEN", "Tournament slug already exists", 409);
      }
      throw new MpError("TOURNAMENTS.CREATE_FAILED", error.message, 500);
    }
    return mapTournament(row);
  });
}

// ── registerToTournament (idempotent) ──────────────────────────────────
const RegisterInputSchema = z.object({
  tournamentId: UuidSchema,
  body: TournamentRegisterSchema,
});

export async function registerToTournament(
  input: unknown,
): Promise<ActionResult<Registration>> {
  return runAction(RegisterInputSchema, input, async ({ tournamentId, body }) => {
    const userId = await requireUserId();
    if (!body.playerIds.includes(userId)) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "You must be in the registered playerIds");
    }

    const idemKey = (await headers()).get("idempotency-key") ?? undefined;
    return withIdempotency(
      { key: idemKey, scope: "registerTournament", userId, input: { tournamentId, body } },
      async () => {
        const supabase = await getServerClient();
        const { data: t } = await supabase
          .from("tournaments")
          .select("status,registration_opens_at,registration_closes_at,max_participants")
          .eq("id", tournamentId)
          .single();
        if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Tournament not found", 404);
        if (!["registration_open", "published"].includes(t.status as string)) {
          throw new MpError(
            "TOURNAMENT.REGISTRATION_CLOSED",
            `Tournament status is '${t.status}'`,
            422,
          );
        }

        const { data: row, error } = await supabase
          .from("registrations")
          .insert({
            tournament_id: tournamentId,
            category_id: body.categoryId ?? null,
            team_id: body.teamId ?? null,
            player_ids: body.playerIds,
            registered_by: userId,
            status: "pending",
          } as never)
          .select()
          .single();
        if (error) throw new MpError("TOURNAMENTS.REGISTER_FAILED", error.message, 500);
        return RegistrationSchema.parse({
          id: row.id,
          tournamentId: row.tournament_id,
          categoryId: (row.category_id as string | null) ?? null,
          teamId: (row.team_id as string | null) ?? null,
          playerIds: row.player_ids,
          registeredBy: row.registered_by,
          status: row.status,
          createdAt: row.created_at,
        });
      },
    );
  });
}

// ── updateRegistrationStatus (partner admin) ───────────────────────────
const UpdateRegSchema = z.object({
  registrationId: UuidSchema,
  status: z.enum(["accepted", "pending", "rejected", "withdrawn"]),
});

export async function updateRegistrationStatus(
  input: unknown,
): Promise<ActionResult<Registration>> {
  return runAction(UpdateRegSchema, input, async ({ registrationId, status }) => {
    const supabase = await getServerClient();
    const { data: reg } = await supabase
      .from("registrations")
      .select("tournament_id")
      .eq("id", registrationId)
      .single();
    if (!reg) throw new MpError("TOURNAMENTS.REG_NOT_FOUND", "Registration not found", 404);
    const { data: t } = await supabase
      .from("tournaments")
      .select("partner_id")
      .eq("id", reg.tournament_id as string)
      .single();
    if (!t?.partner_id)
      throw new MpError("TOURNAMENTS.PARTNER_REQUIRED", "Tournament has no partner", 422);
    await requirePartnerAdmin(t.partner_id as string);

    const { data: row, error } = await supabase
      .from("registrations")
      .update({ status } as never)
      .eq("id", registrationId)
      .select()
      .single();
    if (error) throw new MpError("TOURNAMENTS.UPDATE_REG_FAILED", error.message, 500);
    return RegistrationSchema.parse({
      id: row.id,
      tournamentId: row.tournament_id,
      categoryId: (row.category_id as string | null) ?? null,
      teamId: (row.team_id as string | null) ?? null,
      playerIds: row.player_ids,
      registeredBy: row.registered_by,
      status: row.status,
      createdAt: row.created_at,
    });
  });
}

// ── generateBracket (partner admin) ────────────────────────────────────
// Simplified single-elim with random seeding from accepted registrations.
// Round 1 pairs (R1[0]=a×b, R1[1]=c×d…). Subsequent rounds get empty match
// shells so the UI can render the tree; winners are filled by reportMatch.
const GenerateBracketSchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema.optional(),
});

export async function generateBracket(
  input: unknown,
): Promise<ActionResult<{ bracketId: string; size: number }>> {
  return runAction(GenerateBracketSchema, input, async ({ tournamentId, categoryId }) => {
    const supabase = await getServerClient();
    const { data: t } = await supabase
      .from("tournaments")
      .select("partner_id,format")
      .eq("id", tournamentId)
      .single();
    if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Tournament not found", 404);
    if (t.partner_id) await requirePartnerAdmin(t.partner_id as string);

    let regQ = supabase
      .from("registrations")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("status", "accepted");
    if (categoryId) regQ = regQ.eq("category_id", categoryId);
    const { data: regs } = await regQ;
    const ids = (regs ?? []).map((r) => r.id as string);
    if (ids.length < 2) {
      throw new MpError("BRACKETS.NOT_ENOUGH", "Need at least 2 accepted registrations", 422);
    }

    // Round size = next power of 2 >= ids.length.
    let size = 2;
    while (size < ids.length) size *= 2;

    // Shuffle (simple Fisher-Yates) for seeding.
    const seeded = [...ids];
    for (let i = seeded.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seeded[i], seeded[j]] = [seeded[j], seeded[i]];
    }
    // Pad with nulls (byes) to bracket size.
    while (seeded.length < size) seeded.push(null as unknown as string);

    const { data: bracketRow, error: bErr } = await supabase
      .from("brackets")
      .insert({
        tournament_id: tournamentId,
        category_id: categoryId ?? null,
        format: "single_elim",
        size,
      } as never)
      .select("id")
      .single();
    if (bErr) throw new MpError("BRACKETS.CREATE_FAILED", bErr.message, 500);
    const bracketId = bracketRow.id as string;

    // Build matches per round. Round 1 has size/2 matches; round R has size/2^R.
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
        if (round === 1) {
          m.side_a_registration_id = seeded[pos * 2] ?? null;
          m.side_b_registration_id = seeded[pos * 2 + 1] ?? null;
        }
        matches.push(m);
      }
    }
    if (matches.length > 0) {
      const { error: mErr } = await supabase
        .from("bracket_matches")
        .insert(matches as never);
      if (mErr) throw new MpError("BRACKETS.MATCHES_FAILED", mErr.message, 500);
    }
    return { bracketId, size };
  });
}

// ── getBracket (public) ────────────────────────────────────────────────
export async function getBracket(input: unknown): Promise<ActionResult<Bracket>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const [{ data: bracket, error: bErr }, { data: matches }] = await Promise.all([
      supabase.from("brackets").select("*").eq("id", id).single(),
      supabase
        .from("bracket_matches")
        .select("*")
        .eq("bracket_id", id)
        .order("round")
        .order("position"),
    ]);
    if (bErr || !bracket) throw new MpError("BRACKETS.NOT_FOUND", "Bracket not found", 404);
    return BracketSchema.parse({
      id: bracket.id,
      tournamentId: bracket.tournament_id,
      categoryId: (bracket.category_id as string | null) ?? null,
      format: bracket.format,
      size: bracket.size,
      matches: (matches ?? []).map((m) =>
        BracketMatchSchema.parse({
          id: m.id,
          bracketId: m.bracket_id,
          round: m.round,
          position: m.position,
          sideARegistrationId: (m.side_a_registration_id as string | null) ?? null,
          sideBRegistrationId: (m.side_b_registration_id as string | null) ?? null,
          scheduledAt: (m.scheduled_at as string | null) ?? null,
          courtId: (m.court_id as string | null) ?? null,
          status: m.status,
          winnerSide: (m.winner_side as "a" | "b" | "d" | null) ?? null,
          score: (m.score as Record<string, unknown> | null) ?? null,
        }),
      ),
    });
  });
}

// ── Admin-only: cancelar torneo + leer detalle ─────────────────────────
async function requireAdminUserId(): Promise<string> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Admin required");
  return userId;
}

const CancelTournamentSchema = z.object({
  tournamentId: UuidSchema,
  reason: z.string().min(2).max(500).optional(),
});

export async function cancelTournament(input: unknown): Promise<ActionResult<Tournament>> {
  return runAction(CancelTournamentSchema, input, async ({ tournamentId, reason }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("tournaments")
      .select("status")
      .eq("id", tournamentId)
      .single();
    if (!existing) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);
    if (existing.status === "cancelled") {
      throw new MpError("TOURNAMENTS.ALREADY_CANCELLED", "Ya estaba cancelado", 409);
    }
    if (existing.status === "finished") {
      throw new MpError("TOURNAMENTS.ALREADY_FINISHED", "No se puede cancelar un torneo finalizado", 409);
    }
    const { data, error } = await supabase
      .from("tournaments")
      .update({ status: "cancelled" } as never)
      .eq("id", tournamentId)
      .select()
      .single();
    if (error) throw new MpError("TOURNAMENTS.CANCEL_FAILED", error.message, 500);
    void reason;
    return mapTournament(data);
  });
}

export type AdminTournamentDetail = {
  tournament: Tournament;
  organizerName: string | null;
  organizerEmail: string | null;
  clubName: string | null;
  registrations: {
    id: string;
    teamId: string | null;
    playerIds: string[];
    playerNames: string[];
    status: string;
    paidTransactionId: string | null;
    createdAt: string;
  }[];
  transactions: {
    id: string;
    amountCents: number;
    currency: string | null;
    method: string;
    status: string;
    customerName: string | null;
    createdAt: string;
  }[];
};

export async function getTournamentForAdmin(
  input: unknown,
): Promise<ActionResult<AdminTournamentDetail>> {
  return runAction(z.object({ tournamentId: UuidSchema }), input, async ({ tournamentId }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const { data: tr, error } = await supabase
      .from("tournaments")
      .select("*,organizer:profiles!tournaments_created_by_fkey(display_name),clubs(name)")
      .eq("id", tournamentId)
      .single();
    if (error || !tr) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

    const [{ data: regs }, { data: txs }] = await Promise.all([
      supabase
        .from("registrations")
        .select("id,team_id,player_ids,status,paid_transaction_id,created_at")
        .eq("tournament_id", tournamentId)
        .order("created_at", { ascending: false }),
      supabase
        .from("transactions")
        .select("id,amount_cents,currency,method,status,customer_name,created_at")
        .eq("kind", "tournament")
        .eq("ref_id", tournamentId)
        .order("created_at", { ascending: false }),
    ]);

    // Hidratar nombres de players para todas las registrations.
    const allPlayerIds = new Set<string>();
    for (const r of regs ?? []) {
      for (const pid of (r.player_ids as string[]) ?? []) allPlayerIds.add(pid);
    }
    const nameById = new Map<string, string>();
    if (allPlayerIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", Array.from(allPlayerIds));
      for (const p of profs ?? []) nameById.set(p.id as string, (p.display_name as string) ?? "Jugador");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizer = (tr as any).organizer as { display_name?: string } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const club = (tr as any).clubs as { name?: string } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizerId = (tr as any).created_by as string | null;

    let organizerEmail: string | null = null;
    if (organizerId) {
      const { data: userData } = await getAdminClient().auth.admin.getUserById(organizerId);
      organizerEmail = userData.user?.email ?? null;
    }

    return {
      tournament: mapTournament(tr),
      organizerName: organizer?.display_name ?? null,
      organizerEmail,
      clubName: club?.name ?? null,
      registrations: (regs ?? []).map((r) => {
        const playerIds = (r.player_ids as string[]) ?? [];
        return {
          id: r.id as string,
          teamId: (r.team_id as string | null) ?? null,
          playerIds,
          playerNames: playerIds.map((pid) => nameById.get(pid) ?? "Jugador"),
          status: r.status as string,
          paidTransactionId: (r.paid_transaction_id as string | null) ?? null,
          createdAt: r.created_at as string,
        };
      }),
      transactions: (txs ?? []).map((t) => ({
        id: t.id as string,
        amountCents: t.amount_cents as number,
        currency: (t.currency as string | null) ?? null,
        method: t.method as string,
        status: t.status as string,
        customerName: (t.customer_name as string | null) ?? null,
        createdAt: t.created_at as string,
      })),
    };
  });
}
