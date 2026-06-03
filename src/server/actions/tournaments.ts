"use server";

// Tournaments + leagues + registrations. Bracket generation is a partner action
// that comes later (needs a seeding algorithm).
import "server-only";

import { z } from "zod";
import { headers } from "next/headers";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { getActiveClubDiscountPct, applyDiscount } from "@/server/queries/club-membership";
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
  TournamentPaymentPolicySchema,
  TournamentRegisterSchema,
  TournamentSchema,
  ScoringConfigSchema,
  GroupPlayoffConfigSchema,
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

function parseScoringConfig(raw: unknown) {
  if (!raw) return null;
  const parsed = ScoringConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parseGroupPlayoffConfig(raw: unknown) {
  if (!raw) return null;
  const parsed = GroupPlayoffConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
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
    endsAt: (row.ends_at as string | null) ?? null,
    registrationOpensAt: (row.registration_opens_at as string | null) ?? null,
    registrationClosesAt: (row.registration_closes_at as string | null) ?? null,
    status: row.status,
    maxParticipants: (row.max_participants as number | null) ?? null,
    entryFeeCents: row.entry_fee_cents,
    currency: (row.currency as string | null) ?? null,
    paymentPolicy: (row.payment_policy as string | null) ?? "prepay",
    prizePoolCents: (row.prize_pool_cents as number | null) ?? null,
    rulesUrl: (row.rules_url as string | null) ?? null,
    modality: (row.modality as Tournament["modality"]) ?? null,
    scoringConfig: parseScoringConfig(row.scoring_config),
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

export async function listPastTournaments(
  input: unknown = {},
): Promise<ActionResult<TournamentFeatured[]>> {
  return runAction(FeaturedParamsSchema, input, async ({ limit }) => {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("tournaments_public_summary")
      .select("*")
      .or(`status.eq.finished,ends_at.lt.${new Date().toISOString()}`)
      .order("ends_at", { ascending: false })
      .limit(limit);
    if (error) throw new MpError("TOURNAMENTS.DB_ERROR", error.message, 500);
    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return TournamentFeaturedSchema.parse({
        id: r.id,
        slug: r.slug,
        name: r.name,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        prizePoolCents: r.prize_pool_cents ?? null,
        entryFeeCents: r.entry_fee_cents ?? 0,
        currency: r.currency ?? null,
        maxParticipants: r.max_participants ?? null,
        sport: r.sport,
        format: r.format,
        status: r.status,
        clubName: r.club_name ?? null,
        clubCity: r.club_city ?? null,
        registrationsCount: r.registrations_count ?? 0,
        isFeatured: (r.is_featured as boolean | null | undefined) ?? false,
      });
    });
  });
}

export async function listFeaturedTournaments(
  input: unknown = {},
): Promise<ActionResult<TournamentFeatured[]>> {
  return runAction(FeaturedParamsSchema, input, async ({ limit }) => {
    const supabase = await getServerClient();
    // Trae TODOS los torneos próximos (no solo estelar). El flag is_featured
    // se respeta a nivel de UI: el primer torneo con is_featured=true va al
    // banner grande, el resto va al grid normal.
    const { data, error } = await supabase
      .from("tournaments_public_summary")
      .select("*")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(limit);
    if (error) throw new MpError("TOURNAMENTS.DB_ERROR", error.message, 500);
    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return TournamentFeaturedSchema.parse({
        id: r.id,
        slug: r.slug,
        name: r.name,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        prizePoolCents: r.prize_pool_cents ?? null,
        entryFeeCents: r.entry_fee_cents ?? 0,
        currency: r.currency ?? null,
        maxParticipants: r.max_participants ?? null,
        sport: r.sport,
        format: r.format,
        status: r.status,
        clubName: r.club_name ?? null,
        clubCity: r.club_city ?? null,
        registrationsCount: r.registrations_count ?? 0,
        isFeatured: (r.is_featured as boolean | null | undefined) ?? false,
      });
    });
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
            mprMin: c.mpr_min != null ? Number(c.mpr_min) : null,
            mprMax: c.mpr_max != null ? Number(c.mpr_max) : null,
            stage: (c.stage as TournamentDetail["categories"][number]["stage"]) ?? null,
            groupPlayoffConfig: parseGroupPlayoffConfig(c.group_playoff_config),
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
    const resolvedPolicy =
      data.entryFeeCents === 0
        ? "free"
        : data.paymentPolicy && data.paymentPolicy !== "free"
          ? data.paymentPolicy
          : "prepay";
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
        ends_at: data.endsAt ?? null,
        registration_opens_at: data.registrationOpensAt ?? null,
        registration_closes_at: data.registrationClosesAt ?? null,
        status: "draft",
        max_participants: data.maxParticipants ?? null,
        entry_fee_cents: data.entryFeeCents,
        currency: data.currency ?? null,
        payment_policy: resolvedPolicy,
        prize_pool_cents: data.prizePoolCents ?? null,
        created_by: userId,
        modality: data.modality,
        scoring_config: data.scoringConfig,
      } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("TOURNAMENTS.SLUG_TAKEN", "Tournament slug already exists", 409);
      }
      throw new MpError("TOURNAMENTS.CREATE_FAILED", error.message, 500);
    }

    if (data.format === "groups_to_knockout" && data.groupPlayoffConfig) {
      const admin = getAdminClient();
      await setAuditActor(admin, userId, "partner");
      const modalityLabel =
        data.modality === "singles"
          ? "Singles"
          : data.modality === "mixed_doubles"
            ? "Mixto"
            : "Dobles";
      const { error: catErr } = await admin.from("tournament_categories").insert({
        tournament_id: row.id,
        name: modalityLabel,
        stage: "pending_groups",
        group_playoff_config: data.groupPlayoffConfig,
      } as never);
      if (catErr) {
        throw new MpError("TOURNAMENTS.CATEGORY_FAILED", catErr.message, 500);
      }
    }

    return mapTournament(row);
  });
}

// ── registerToTournament (idempotent) ──────────────────────────────────
// Honra tournament.payment_policy igual que registerToEvent:
//   - free      → registration 'pending' (espera aprobación admin) sin tx.
//   - prepay    → tx pending_proof + registration 'pending' con paid_transaction_id.
//                 approvePaymentProof flippa a 'accepted'.
//   - onsite    → tx pending (cobro en mostrador) + registration 'pending'.
//                 Admin acepta manualmente; al cobrar marca tx captured.
//   - flexible  → usuario elige paymentMode.
// Las registrations de torneo arrancan en 'pending' siempre (revisión admin),
// no en 'accepted' — admin las acepta vía updateRegistrationStatus / aprobando
// el comprobante.
const RegisterInputSchema = z.object({
  tournamentId: UuidSchema,
  body: TournamentRegisterSchema,
  paymentMode: z.enum(["online", "onsite"]).optional(),
});

export async function registerToTournament(
  input: unknown,
): Promise<ActionResult<Registration>> {
  return runAction(RegisterInputSchema, input, async ({ tournamentId, body, paymentMode }) => {
    const userId = await requireUserId();
    if (!body.playerIds.includes(userId)) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "You must be in the registered playerIds");
    }

    const idemKey = (await headers()).get("idempotency-key") ?? undefined;
    return withIdempotency(
      { key: idemKey, scope: "registerTournament", userId, input: { tournamentId, body, paymentMode } },
      async () => {
        const supabase = await getServerClient();
        const { assertNotSuspended } = await import("@/lib/auth/suspension");
        await assertNotSuspended(supabase, userId);
        const { data: t } = await supabase
          .from("tournaments")
          .select("status,registration_opens_at,registration_closes_at,max_participants,entry_fee_cents,currency,club_id,payment_policy")
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

        // Anti-doble-registro: si el user ya tiene registration activa en
        // este torneo, devolvemos error con código claro. El trigger DB es
        // la red de seguridad; este chequeo da mensajes amigables sin
        // crear transacción intermedia.
        const { data: existing } = await supabase
          .from("registrations")
          .select("id,status")
          .eq("tournament_id", tournamentId)
          .contains("player_ids", [userId])
          .not("status", "in", "(withdrawn,rejected,cancelled)")
          .limit(1)
          .maybeSingle();
        if (existing) {
          throw new MpError(
            "TOURNAMENTS.ALREADY_REGISTERED",
            "Ya estás inscrito en este torneo.",
            409,
          );
        }

        const policy = (t.payment_policy as string) ?? "prepay";
        const feeCents = (t.entry_fee_cents as number) ?? 0;

        let effectiveMode: "free" | "online" | "onsite";
        if (policy === "free" || feeCents === 0) {
          effectiveMode = "free";
        } else if (policy === "prepay") {
          effectiveMode = "online";
        } else if (policy === "onsite") {
          effectiveMode = "onsite";
        } else {
          if (!paymentMode) {
            throw new MpError(
              "TOURNAMENTS.PAYMENT_MODE_REQUIRED",
              "Este torneo requiere elegir entre pago online u onsite",
              422,
            );
          }
          effectiveMode = paymentMode;
        }

        // Para los INSERTs usamos el admin client. La autorización ya se
        // hizo arriba (userId via requireUserId + check que userId está en
        // body.playerIds). RLS bypassing aquí evita falsos negativos por
        // contexto auth en server actions; ambos campos quedan amarrados a
        // userId en código.
        const admin = getAdminClient();
        await setAuditActor(admin, userId, "user");
        let paidTransactionId: string | null = null;
        if (effectiveMode !== "free") {
          // Descuento de membresía VIP del club organizador (si aplica).
          const clubId = (t.club_id as string | null) ?? null;
          const discountPct = clubId ? await getActiveClubDiscountPct(userId, clubId) : 0;
          const chargeCents = applyDiscount(feeCents, discountPct);
          const { data: tx, error: txErr } = await admin
            .from("transactions")
            .insert({
              club_id: clubId,
              kind: "tournament",
              ref_id: tournamentId,
              customer_user_id: userId,
              amount_cents: chargeCents,
              currency: ((t.currency as string | null) ?? "USD"),
              method: "transfer",
              status: effectiveMode === "online" ? "pending_proof" : "pending",
              created_by: userId,
            } as never)
            .select("id")
            .single();
          if (txErr || !tx) {
            throw new MpError("TOURNAMENTS.TX_CREATE_FAILED", txErr?.message ?? "tx error", 500);
          }
          paidTransactionId = tx.id as string;
        }

        const { data: row, error } = await admin
          .from("registrations")
          .insert({
            tournament_id: tournamentId,
            category_id: body.categoryId ?? null,
            team_id: body.teamId ?? null,
            player_ids: body.playerIds,
            registered_by: userId,
            status: "pending",
            paid_transaction_id: paidTransactionId,
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
          paidTransactionId: (row.paid_transaction_id as string | null) ?? null,
          createdAt: row.created_at,
        });
      },
    );
  });
}

// ── setTournamentStatus (partner u admin) ──────────────────────────────
// Permite que el partner cambie el estado del torneo (ej. cerrar
// inscripciones). Admin también puede.
const SetStatusSchema = z.object({
  tournamentId: UuidSchema,
  status: z.enum([
    "draft",
    "published",
    "registration_open",
    "registration_closed",
    "live",
    "finished",
    "cancelled",
  ]),
});

export async function setTournamentStatus(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  return runAction(SetStatusSchema, input, async ({ tournamentId, status }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: t } = await supabase
      .from("tournaments")
      .select("id,name,partner_id,status,starts_at,ends_at")
      .eq("id", tournamentId)
      .maybeSingle();
    if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Tournament not found", 404);
    const previousStatus = t.status as string;
    // Admin global o partner del torneo.
    const { data: isAdmin } = await supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .is("revoked_at", null)
      .maybeSingle();
    if (!isAdmin) {
      const partnerId = t.partner_id as string | null;
      if (!partnerId) {
        throw new AuthError("AUTH.ROLE_REQUIRED", "Tournament has no partner — admin only");
      }
      const { data: member } = await supabase
        .from("partner_members")
        .select("user_id")
        .eq("partner_id", partnerId)
        .eq("user_id", userId)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      if (!member) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo partner/admin");
    }
    const admin = getAdminClient();
    await setAuditActor(admin, userId, isAdmin ? "admin" : "partner");
    const { data: updated, error } = await admin
      .from("tournaments")
      .update({ status } as never)
      .eq("id", tournamentId)
      .select("id,status")
      .single();
    if (error) throw new MpError("TOURNAMENTS.UPDATE_FAILED", error.message, 500);

    // Si pasa a 'cancelled' (y antes no lo estaba), notificar a inscritos.
    if (status === "cancelled" && previousStatus !== "cancelled") {
      const { data: regs } = await admin
        .from("registrations")
        .select("player_ids,status")
        .eq("tournament_id", tournamentId)
        .in("status", ["pending", "accepted"]);
      const userIdSet = new Set<string>();
      for (const r of regs ?? []) {
        for (const pid of (r.player_ids as string[]) ?? []) {
          if (pid) userIdSet.add(pid);
        }
      }
      const userIds = Array.from(userIdSet);
      if (userIds.length > 0) {
        const payload = {
          tournament_id: tournamentId,
          tournament_name: t.name,
          starts_at: t.starts_at,
          ends_at: t.ends_at,
        };
        const jobs = userIds.map((uid) => ({
          user_id: uid,
          role: "user",
          kind: "tournament_cancelled",
          channel: "inapp",
          payload,
          status: "pending",
        }));
        const { error: jobErr } = await admin
          .from("notification_jobs")
          .insert(jobs as never);
        if (jobErr) {
          console.error(
            "[setTournamentStatus] enqueue cancel notifications failed:",
            jobErr.message,
          );
        }
      }
      // Audit log de la cancelación.
      await admin.rpc("fn_admin_audit_log", {
        p_entity: "tournaments",
        p_entity_id: tournamentId,
        p_action: "tournament.cancelled",
        p_diff: { from: previousStatus, to: "cancelled" } as never,
      });
    }

    return { id: updated.id as string, status: updated.status as string };
  });
}

// ── markRegistrationPaidByPartner ──────────────────────────────────────
// El partner (owner del torneo) marca como pagada una inscripción onsite
// que el jugador efectivamente pagó al llegar al club. Setea la transacción
// asociada a status='captured'.
const MarkPaidSchema = z.object({ registrationId: UuidSchema });

export async function markRegistrationPaidByPartner(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  return runAction(MarkPaidSchema, input, async ({ registrationId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: reg } = await supabase
      .from("registrations")
      .select("id,tournament_id,paid_transaction_id,tournaments(partner_id)")
      .eq("id", registrationId)
      .maybeSingle();
    if (!reg) throw new MpError("REGISTRATION.NOT_FOUND", "Registration not found", 404);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const partnerId = ((reg as any).tournaments?.partner_id as string | null) ?? null;
    if (!partnerId) {
      throw new MpError("TOURNAMENTS.NO_PARTNER", "Tournament has no partner owner", 422);
    }
    // Verificar membresía del caller en el partner_org.
    const { data: member } = await supabase
      .from("partner_members")
      .select("user_id,role")
      .eq("partner_id", partnerId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el partner organizador puede marcar pagado");
    }
    const txId = reg.paid_transaction_id as string | null;
    if (!txId) {
      throw new MpError("REGISTRATION.NO_TX", "Esta inscripción no tiene transacción asociada", 422);
    }
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "partner");
    const { data: updated, error } = await admin
      .from("transactions")
      .update({ status: "captured" } as never)
      .eq("id", txId)
      .select("id,status")
      .single();
    if (error) throw new MpError("TX.UPDATE_FAILED", error.message, 500);
    return { id: updated.id as string, status: updated.status as string };
  });
}

// ── cancelMyRegistration (player) ──────────────────────────────────────
// Soft-cancel: marca status='withdrawn'. Solo el propio user puede ejecutarla
// sobre sus registrations activas.
const CancelMyRegSchema = z.object({ registrationId: UuidSchema });

export async function cancelMyRegistration(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  return runAction(CancelMyRegSchema, input, async ({ registrationId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: reg } = await supabase
      .from("registrations")
      .select("id,player_ids,status")
      .eq("id", registrationId)
      .maybeSingle();
    if (!reg) throw new MpError("REGISTRATION.NOT_FOUND", "Registration not found", 404);
    const players = (reg.player_ids as string[] | null) ?? [];
    if (!players.includes(userId)) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the registered player can cancel");
    }
    if (reg.status === "withdrawn") {
      return { id: reg.id as string, status: "withdrawn" };
    }
    const { data: updated, error } = await supabase
      .from("registrations")
      .update({ status: "withdrawn" } as never)
      .eq("id", registrationId)
      .select("id,status")
      .single();
    if (error) throw new MpError("REGISTRATION.UPDATE_FAILED", error.message, 500);
    return { id: updated.id as string, status: updated.status as string };
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
      .select("tournament_id,player_ids,status")
      .eq("id", registrationId)
      .single();
    if (!reg) throw new MpError("TOURNAMENTS.REG_NOT_FOUND", "Registration not found", 404);
    const previousStatus = reg.status as string;
    const { data: t } = await supabase
      .from("tournaments")
      .select("id,name,partner_id,slug")
      .eq("id", reg.tournament_id as string)
      .single();
    if (!t?.partner_id)
      throw new MpError("TOURNAMENTS.PARTNER_REQUIRED", "Tournament has no partner", 422);
    const callerId = await requirePartnerAdmin(t.partner_id as string);

    const { data: row, error } = await supabase
      .from("registrations")
      .update({ status } as never)
      .eq("id", registrationId)
      .select()
      .single();
    if (error) throw new MpError("TOURNAMENTS.UPDATE_REG_FAILED", error.message, 500);

    // Notificación in-app: el partner cambió el status a accepted o rejected
    // (no en cada cambio intermedio). Encolamos un job por cada jugador del
    // registration.player_ids. El dispatcher (migration 079) renderiza el
    // título/body en base al kind.
    const shouldNotify =
      (status === "accepted" || status === "rejected") && status !== previousStatus;
    if (shouldNotify) {
      const players = (reg.player_ids as string[] | null) ?? [];
      const userIds = Array.from(new Set(players.filter((x): x is string => !!x)));
      if (userIds.length > 0) {
        const admin = getAdminClient();
        await setAuditActor(admin, callerId, "partner");
        const payload = {
          tournament_id: t.id,
          tournament_slug: t.slug,
          tournament_name: t.name,
          registration_id: row.id,
        };
        const kind = status === "accepted" ? "registration_accepted" : "registration_rejected";
        const jobs = userIds.map((uid) => ({
          user_id: uid,
          role: "user",
          kind,
          channel: "inapp",
          payload,
          status: "pending",
        }));
        const { error: jobErr } = await admin
          .from("notification_jobs")
          .insert(jobs as never);
        if (jobErr) {
          console.error(
            "[updateRegistrationStatus] enqueue notifications failed:",
            jobErr.message,
          );
        }
      }
    }

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
    if (t.format === "groups_to_knockout") {
      throw new MpError(
        "BRACKETS.USE_GROUP_FLOW",
        "Este torneo usa fase de grupos. Sortea grupos y genera la llave desde el panel de fase de grupos.",
        422,
      );
    }

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

// ── setTournamentFeatured (admin) ──────────────────────────────────────
// Marca / desmarca un torneo como "evento estelar" para portada.
const SetFeaturedSchema = z.object({
  tournamentId: UuidSchema,
  featured: z.boolean(),
});

export async function setTournamentFeatured(
  input: unknown,
): Promise<ActionResult<{ id: string; isFeatured: boolean }>> {
  return runAction(SetFeaturedSchema, input, async ({ tournamentId, featured }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("tournaments")
      .update({ is_featured: featured })
      .eq("id", tournamentId)
      .select("id,is_featured")
      .single();
    if (error) throw new MpError("TOURNAMENTS.UPDATE_FAILED", error.message, 500);
    return {
      id: data.id as string,
      isFeatured: data.is_featured as boolean,
    };
  });
}

const CancelTournamentSchema = z.object({
  tournamentId: UuidSchema,
  reason: z.string().min(2).max(500).optional(),
});

export async function cancelTournament(input: unknown): Promise<ActionResult<Tournament>> {
  return runAction(CancelTournamentSchema, input, async ({ tournamentId, reason }) => {
    await requireAdminUserId();
    // Pre-checks específicos del endpoint admin (rechazos más finos que el
    // setTournamentStatus genérico).
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
      throw new MpError(
        "TOURNAMENTS.ALREADY_FINISHED",
        "No se puede cancelar un torneo finalizado",
        409,
      );
    }
    // Delegamos en setTournamentStatus para reusar el enqueue de notificaciones
    // 'tournament_cancelled' + audit log + admin client. Pasar reason no se
    // persiste por ahora — la cancelación se loguea via audit_log.
    void reason;
    const res = await setTournamentStatus({ tournamentId, status: "cancelled" });
    if (!res.ok) throw new MpError("TOURNAMENTS.CANCEL_FAILED", res.error.message, 500);
    // Re-leer para devolver shape Tournament completo (setTournamentStatus
    // sólo devuelve {id, status}).
    const admin = getAdminClient();
    const { data: updated, error } = await admin
      .from("tournaments")
      .select("*")
      .eq("id", tournamentId)
      .single();
    if (error || !updated) throw new MpError("TOURNAMENTS.CANCEL_FAILED", error?.message ?? "no row", 500);
    return mapTournament(updated);
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
  brackets: {
    id: string;
    categoryId: string | null;
    format: string;
    size: number;
    generatedAt: string;
    matches: {
      id: string;
      round: number;
      position: number;
      status: string;
      sideARegistrationId: string | null;
      sideBRegistrationId: string | null;
      winnerSide: string | null;
      score: unknown;
      scheduledAt: string | null;
    }[];
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

    const [{ data: regs }, { data: txs }, { data: brackets }] = await Promise.all([
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
      supabase
        .from("brackets")
        .select("id,category_id,format,size,generated_at")
        .eq("tournament_id", tournamentId)
        .order("generated_at", { ascending: false }),
    ]);

    const bracketIds = (brackets ?? []).map((b) => b.id as string);
    const { data: bracketMatches } =
      bracketIds.length > 0
        ? await supabase
            .from("bracket_matches")
            .select("id,bracket_id,round,position,status,side_a_registration_id,side_b_registration_id,winner_side,score,scheduled_at")
            .in("bracket_id", bracketIds)
            .order("round", { ascending: true })
            .order("position", { ascending: true })
        : { data: [] };
    const matchesByBracket = new Map<string, NonNullable<typeof bracketMatches>>();
    for (const match of bracketMatches ?? []) {
      const bracketId = match.bracket_id as string;
      matchesByBracket.set(bracketId, [...(matchesByBracket.get(bracketId) ?? []), match]);
    }

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
      brackets: (brackets ?? []).map((b) => ({
        id: b.id as string,
        categoryId: (b.category_id as string | null) ?? null,
        format: b.format as string,
        size: b.size as number,
        generatedAt: b.generated_at as string,
        matches: (matchesByBracket.get(b.id as string) ?? []).map((m) => ({
          id: m.id as string,
          round: m.round as number,
          position: m.position as number,
          status: m.status as string,
          sideARegistrationId: (m.side_a_registration_id as string | null) ?? null,
          sideBRegistrationId: (m.side_b_registration_id as string | null) ?? null,
          winnerSide: (m.winner_side as string | null) ?? null,
          score: m.score ?? null,
          scheduledAt: (m.scheduled_at as string | null) ?? null,
        })),
      })),
    };
  });
}

// ── updateTournamentByOrganizer (partner OR admin) ─────────────────────
// Edición del torneo desde el panel del partner. Admin global también puede.
// Misma validación que `updateTournamentAdmin` (admin-tournaments-edit.ts)
// pero con autorización extendida — duplicamos a propósito para mantener
// los dos paths separados y auditables. Reusa los jobs de reschedule.
const UpdateByOrganizerSchema = z.object({
  tournamentId: UuidSchema,
  patch: z
    .object({
      name: z.string().min(2).max(120).optional(),
      startsAt: z.string().datetime({ offset: true }).optional(),
      endsAt: z.string().datetime({ offset: true }).nullable().optional(),
      maxParticipants: z.number().int().positive().nullable().optional(),
      entryFeeCents: z.number().int().min(0).optional(),
      prizePoolCents: z.number().int().min(0).nullable().optional(),
      paymentPolicy: TournamentPaymentPolicySchema.optional(),
    })
    .refine((p) => Object.keys(p).length > 0, { message: "patch vacío" }),
});

export async function updateTournamentByOrganizer(
  input: unknown,
): Promise<ActionResult<Tournament>> {
  return runAction(UpdateByOrganizerSchema, input, async ({ tournamentId, patch }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: existing, error: readErr } = await supabase
      .from("tournaments")
      .select(
        "id,name,partner_id,starts_at,ends_at,max_participants,entry_fee_cents,prize_pool_cents,status,payment_policy",
      )
      .eq("id", tournamentId)
      .maybeSingle();
    if (readErr || !existing) {
      throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);
    }
    if (existing.status === "finished" || existing.status === "cancelled") {
      throw new MpError(
        "TOURNAMENTS.NOT_EDITABLE",
        `No se puede editar un torneo '${existing.status}'`,
        409,
      );
    }

    // Authz: admin global o partner_member (owner/admin) del partner_org.
    const { data: adminRow } = await supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .is("revoked_at", null)
      .maybeSingle();
    const isAdmin = !!adminRow;
    if (!isAdmin) {
      const partnerId = existing.partner_id as string | null;
      if (!partnerId) {
        throw new AuthError("AUTH.ROLE_REQUIRED", "Torneo sin partner — solo admin");
      }
      const { data: member } = await supabase
        .from("partner_members")
        .select("user_id")
        .eq("partner_id", partnerId)
        .eq("user_id", userId)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      if (!member) {
        throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el partner organizador o un admin");
      }
    }

    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.startsAt !== undefined) update.starts_at = patch.startsAt;
    if (patch.endsAt !== undefined) update.ends_at = patch.endsAt;
    if (patch.maxParticipants !== undefined)
      update.max_participants = patch.maxParticipants;
    if (patch.entryFeeCents !== undefined) update.entry_fee_cents = patch.entryFeeCents;
    if (patch.prizePoolCents !== undefined) update.prize_pool_cents = patch.prizePoolCents;
    if (patch.paymentPolicy !== undefined) update.payment_policy = patch.paymentPolicy;

    const newStart =
      (update.starts_at as string | undefined) ?? (existing.starts_at as string);
    // ends_at puede ser null (torneo de un solo día). Solo validamos el rango
    // cuando el resultado tiene fin definido.
    const rawNewEnd =
      "ends_at" in update
        ? (update.ends_at as string | null | undefined)
        : (existing.ends_at as string | null);
    const newEnd: string | null = rawNewEnd ?? null;
    if (newEnd && new Date(newStart) >= new Date(newEnd)) {
      throw new MpError(
        "TOURNAMENTS.BAD_RANGE",
        "La fecha de inicio debe ser anterior a la de fin",
        422,
      );
    }

    const resultingFee =
      (update.entry_fee_cents as number | undefined) ??
      (existing.entry_fee_cents as number);
    const resultingPolicy =
      (update.payment_policy as string | undefined) ??
      (existing.payment_policy as string);
    if (resultingFee === 0 && resultingPolicy !== "free") {
      throw new MpError(
        "TOURNAMENTS.POLICY_MISMATCH",
        "Torneos sin cuota deben tener policy='free'",
        422,
      );
    }
    if (resultingFee > 0 && resultingPolicy === "free") {
      throw new MpError(
        "TOURNAMENTS.POLICY_MISMATCH",
        "Torneos con cuota no pueden tener policy='free'; usa prepay/onsite/flexible",
        422,
      );
    }

    // Admin client para el update (RLS de tournaments puede ser restrictiva).
    const adminClient = getAdminClient();
    await setAuditActor(adminClient, userId, isAdmin ? "admin" : "partner");
    const { data: updated, error: updErr } = await adminClient
      .from("tournaments")
      .update(update as never)
      .eq("id", tournamentId)
      .select()
      .single();
    if (updErr) throw new MpError("TOURNAMENTS.UPDATE_FAILED", updErr.message, 500);

    // Audit log (best-effort).
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of Object.keys(update)) {
      diff[key] = {
        before: (existing as Record<string, unknown>)[key] ?? null,
        after: (updated as Record<string, unknown>)[key] ?? null,
      };
    }
    const { error: logErr } = await adminClient.rpc("fn_admin_audit_log", {
      p_entity: "tournaments",
      p_entity_id: tournamentId,
      p_action: isAdmin ? "tournament.admin_edit" : "tournament.partner_edit",
      p_diff: diff as never,
    });
    if (logErr) {
      console.error("[updateTournamentByOrganizer] audit rpc failed:", logErr.message);
    }

    // Si cambian fechas, encolar notificaciones a inscritos.
    const dateChanged = patch.startsAt !== undefined || patch.endsAt !== undefined;
    if (dateChanged) {
      const { data: regs } = await adminClient
        .from("registrations")
        .select("player_ids,status")
        .eq("tournament_id", tournamentId)
        .in("status", ["pending", "accepted"]);
      const userIdSet = new Set<string>();
      for (const r of regs ?? []) {
        for (const pid of (r.player_ids as string[]) ?? []) {
          if (pid) userIdSet.add(pid);
        }
      }
      const userIds = Array.from(userIdSet);
      if (userIds.length > 0) {
        const payloadBase = {
          tournament_id: tournamentId,
          tournament_name: updated.name,
          starts_at: updated.starts_at,
          ends_at: updated.ends_at,
          previous_starts_at: existing.starts_at,
          previous_ends_at: existing.ends_at,
        };
        const jobs = userIds.map((uid) => ({
          user_id: uid,
          role: "user",
          kind: "tournament_rescheduled",
          channel: "inapp",
          payload: payloadBase,
          status: "pending",
        }));
        const { error: jobErr } = await adminClient
          .from("notification_jobs")
          .insert(jobs as never);
        if (jobErr) {
          console.error(
            "[updateTournamentByOrganizer] enqueue notifications failed:",
            jobErr.message,
          );
        }
      }
    }

    return mapTournament(updated);
  });
}

// ── Categorías del torneo (partner OR admin) ───────────────────────────
// Helper auth: el caller debe ser admin global o partner_member (owner/admin)
// del partner_org del torneo. Reusado por create/update/delete.
async function requireTournamentEditor(tournamentId: string): Promise<{
  userId: string;
  isAdmin: boolean;
  partnerId: string | null;
  actorRole: "admin" | "partner";
}> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data: t } = await supabase
    .from("tournaments")
    .select("partner_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);
  const partnerId = (t.partner_id as string | null) ?? null;
  const { data: adminRow } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  const isAdmin = !!adminRow;
  if (isAdmin) return { userId, isAdmin, partnerId, actorRole: "admin" };
  if (!partnerId) {
    throw new AuthError("AUTH.ROLE_REQUIRED", "Torneo sin partner — solo admin");
  }
  const { data: member } = await supabase
    .from("partner_members")
    .select("user_id")
    .eq("partner_id", partnerId)
    .eq("user_id", userId)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!member) {
    throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el partner organizador o un admin");
  }
  return { userId, isAdmin, partnerId, actorRole: "partner" };
}

const CategoryBodySchema = z.object({
  name: z.string().min(1).max(80),
  gender: z.enum(["m", "f", "mixed", "open"]).nullable().optional(),
  level: z.enum(["beginner", "intermediate", "advanced", "pro"]).nullable().optional(),
  mprMin: z.number().min(2.0).max(8.0).nullable().optional(),
  mprMax: z.number().min(2.0).max(8.0).nullable().optional(),
  ageMin: z.number().int().min(0).max(120).nullable().optional(),
  ageMax: z.number().int().min(0).max(120).nullable().optional(),
  maxTeams: z.number().int().positive().nullable().optional(),
});

const CreateCategorySchema = z.object({
  tournamentId: UuidSchema,
  body: CategoryBodySchema,
});

export type TournamentCategoryRow = {
  id: string;
  tournamentId: string;
  name: string;
  gender: string | null;
  level: string | null;
  mprMin: number | null;
  mprMax: number | null;
  ageMin: number | null;
  ageMax: number | null;
  maxTeams: number | null;
};

function mapCategory(row: Record<string, unknown>): TournamentCategoryRow {
  return {
    id: row.id as string,
    tournamentId: row.tournament_id as string,
    name: row.name as string,
    gender: (row.gender as string | null) ?? null,
    level: (row.level as string | null) ?? null,
    mprMin: row.mpr_min != null ? Number(row.mpr_min) : null,
    mprMax: row.mpr_max != null ? Number(row.mpr_max) : null,
    ageMin: (row.age_min as number | null) ?? null,
    ageMax: (row.age_max as number | null) ?? null,
    maxTeams: (row.max_teams as number | null) ?? null,
  };
}

export async function createTournamentCategory(
  input: unknown,
): Promise<ActionResult<TournamentCategoryRow>> {
  return runAction(CreateCategorySchema, input, async ({ tournamentId, body }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    await setAuditActor(admin, editor.userId, editor.actorRole);

    const { data: tRow } = await admin
      .from("tournaments")
      .select("format")
      .eq("id", tournamentId)
      .single();
    const insertRow: Record<string, unknown> = {
      tournament_id: tournamentId,
      name: body.name,
      gender: body.gender ?? null,
      level: body.level ?? null,
      mpr_min: body.mprMin ?? null,
      mpr_max: body.mprMax ?? null,
      age_min: body.ageMin ?? null,
      age_max: body.ageMax ?? null,
      max_teams: body.maxTeams ?? null,
    };
    if (tRow?.format === "groups_to_knockout") {
      insertRow.stage = "pending_groups";
      insertRow.group_playoff_config = {
        groupsCount: 2,
        advancePerGroup: 4,
        finalScoringOverride: null,
      };
    }

    const { data, error } = await admin
      .from("tournament_categories")
      .insert(insertRow as never)
      .select()
      .single();
    if (error) throw new MpError("CATEGORY.CREATE_FAILED", error.message, 500);
    return mapCategory(data as Record<string, unknown>);
  });
}

const UpdateCategorySchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema,
  body: CategoryBodySchema.partial(),
});

export async function updateTournamentCategory(
  input: unknown,
): Promise<ActionResult<TournamentCategoryRow>> {
  return runAction(UpdateCategorySchema, input, async ({ tournamentId, categoryId, body }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.gender !== undefined) update.gender = body.gender;
    if (body.level !== undefined) update.level = body.level;
    if (body.mprMin !== undefined) update.mpr_min = body.mprMin;
    if (body.mprMax !== undefined) update.mpr_max = body.mprMax;
    if (body.ageMin !== undefined) update.age_min = body.ageMin;
    if (body.ageMax !== undefined) update.age_max = body.ageMax;
    if (body.maxTeams !== undefined) update.max_teams = body.maxTeams;
    if (Object.keys(update).length === 0) {
      throw new MpError("CATEGORY.EMPTY_PATCH", "Nada que actualizar", 422);
    }
    await setAuditActor(admin, editor.userId, editor.actorRole);
    const { data, error } = await admin
      .from("tournament_categories")
      .update(update as never)
      .eq("id", categoryId)
      .eq("tournament_id", tournamentId)
      .select()
      .single();
    if (error) throw new MpError("CATEGORY.UPDATE_FAILED", error.message, 500);
    return mapCategory(data as Record<string, unknown>);
  });
}

const DeleteCategorySchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema,
});

export async function deleteTournamentCategory(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(DeleteCategorySchema, input, async ({ tournamentId, categoryId }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    // Bloqueamos delete si ya hay inscripciones que la usan, para evitar
    // huérfanos. El partner debería mover/cancelar inscripciones primero.
    const { count } = await admin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId);
    if ((count ?? 0) > 0) {
      throw new MpError(
        "CATEGORY.HAS_REGISTRATIONS",
        "No se puede borrar: la categoría tiene inscripciones. Cancela o mueve las inscripciones primero.",
        409,
      );
    }
    await setAuditActor(admin, editor.userId, editor.actorRole);
    const { error } = await admin
      .from("tournament_categories")
      .delete()
      .eq("id", categoryId)
      .eq("tournament_id", tournamentId);
    if (error) throw new MpError("CATEGORY.DELETE_FAILED", error.message, 500);
    return { id: categoryId };
  });
}

// ── Cronograma del torneo (partner OR admin) ───────────────────────────
const ScheduleBodySchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  label: z.string().min(1).max(200),
  categoryId: UuidSchema.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type TournamentScheduleBlockRow = {
  id: string;
  tournamentId: string;
  categoryId: string | null;
  startsAt: string;
  label: string;
  notes: string | null;
};

function mapBlock(row: Record<string, unknown>): TournamentScheduleBlockRow {
  return {
    id: row.id as string,
    tournamentId: row.tournament_id as string,
    categoryId: (row.category_id as string | null) ?? null,
    startsAt: row.starts_at as string,
    label: row.label as string,
    notes: (row.notes as string | null) ?? null,
  };
}

const CreateBlockSchema = z.object({
  tournamentId: UuidSchema,
  body: ScheduleBodySchema,
});

export async function createScheduleBlock(
  input: unknown,
): Promise<ActionResult<TournamentScheduleBlockRow>> {
  return runAction(CreateBlockSchema, input, async ({ tournamentId, body }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    await setAuditActor(admin, editor.userId, editor.actorRole);
    const { data, error } = await admin
      .from("tournament_schedule_blocks" as never)
      .insert({
        tournament_id: tournamentId,
        category_id: body.categoryId ?? null,
        starts_at: body.startsAt,
        label: body.label,
        notes: body.notes ?? null,
        created_by: editor.userId,
      } as never)
      .select()
      .single();
    if (error) throw new MpError("SCHEDULE.CREATE_FAILED", error.message, 500);
    return mapBlock(data as Record<string, unknown>);
  });
}

const UpdateBlockSchema = z.object({
  tournamentId: UuidSchema,
  blockId: UuidSchema,
  body: ScheduleBodySchema.partial(),
});

export async function updateScheduleBlock(
  input: unknown,
): Promise<ActionResult<TournamentScheduleBlockRow>> {
  return runAction(UpdateBlockSchema, input, async ({ tournamentId, blockId, body }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    const update: Record<string, unknown> = {};
    if (body.startsAt !== undefined) update.starts_at = body.startsAt;
    if (body.label !== undefined) update.label = body.label;
    if (body.categoryId !== undefined) update.category_id = body.categoryId;
    if (body.notes !== undefined) update.notes = body.notes;
    if (Object.keys(update).length === 0) {
      throw new MpError("SCHEDULE.EMPTY_PATCH", "Nada que actualizar", 422);
    }
    await setAuditActor(admin, editor.userId, editor.actorRole);
    const { data, error } = await admin
      .from("tournament_schedule_blocks" as never)
      .update(update as never)
      .eq("id", blockId)
      .eq("tournament_id", tournamentId)
      .select()
      .single();
    if (error) throw new MpError("SCHEDULE.UPDATE_FAILED", error.message, 500);
    return mapBlock(data as Record<string, unknown>);
  });
}

const DeleteBlockSchema = z.object({
  tournamentId: UuidSchema,
  blockId: UuidSchema,
});

export async function deleteScheduleBlock(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(DeleteBlockSchema, input, async ({ tournamentId, blockId }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    await setAuditActor(admin, editor.userId, editor.actorRole);
    const { error } = await admin
      .from("tournament_schedule_blocks" as never)
      .delete()
      .eq("id", blockId)
      .eq("tournament_id", tournamentId);
    if (error) throw new MpError("SCHEDULE.DELETE_FAILED", error.message, 500);
    return { id: blockId };
  });
}

// ── Premios del torneo (partner OR admin) ──────────────────────────────
const PrizeBodySchema = z.object({
  placeLabel: z.string().min(1).max(80),
  prizeLabel: z.string().min(1).max(280),
  valueCents: z.number().int().min(0).nullable().optional(),
  sponsor: z.string().max(120).nullable().optional(),
  position: z.number().int().min(0).optional(),
});

export type TournamentPrizeRow = {
  id: string;
  position: number;
  placeLabel: string;
  prizeLabel: string;
  valueCents: number | null;
  sponsor: string | null;
};

function mapPrize(row: Record<string, unknown>): TournamentPrizeRow {
  return {
    id: row.id as string,
    position: (row.position as number | null) ?? 0,
    placeLabel: row.place_label as string,
    prizeLabel: row.prize_label as string,
    valueCents: (row.value_cents as number | null) ?? null,
    sponsor: (row.sponsor as string | null) ?? null,
  };
}

const CreatePrizeSchema = z.object({
  tournamentId: UuidSchema,
  body: PrizeBodySchema,
});

export async function createTournamentPrize(
  input: unknown,
): Promise<ActionResult<TournamentPrizeRow>> {
  return runAction(CreatePrizeSchema, input, async ({ tournamentId, body }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    await setAuditActor(admin, editor.userId, editor.actorRole);
    const { data, error } = await admin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tournament_prizes" as any)
      .insert({
        tournament_id: tournamentId,
        position: body.position ?? 0,
        place_label: body.placeLabel,
        prize_label: body.prizeLabel,
        value_cents: body.valueCents ?? null,
        sponsor: body.sponsor ?? null,
      } as never)
      .select()
      .single();
    if (error) throw new MpError("PRIZE.CREATE_FAILED", error.message, 500);
    return mapPrize(data as unknown as Record<string, unknown>);
  });
}

const UpdatePrizeSchema = z.object({
  tournamentId: UuidSchema,
  prizeId: UuidSchema,
  body: PrizeBodySchema.partial(),
});

export async function updateTournamentPrize(
  input: unknown,
): Promise<ActionResult<TournamentPrizeRow>> {
  return runAction(UpdatePrizeSchema, input, async ({ tournamentId, prizeId, body }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    const update: Record<string, unknown> = {};
    if (body.placeLabel !== undefined) update.place_label = body.placeLabel;
    if (body.prizeLabel !== undefined) update.prize_label = body.prizeLabel;
    if (body.valueCents !== undefined) update.value_cents = body.valueCents;
    if (body.sponsor !== undefined) update.sponsor = body.sponsor;
    if (body.position !== undefined) update.position = body.position;
    if (Object.keys(update).length === 0) {
      throw new MpError("PRIZE.EMPTY_PATCH", "Nada que actualizar", 422);
    }
    await setAuditActor(admin, editor.userId, editor.actorRole);
    const { data, error } = await admin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tournament_prizes" as any)
      .update(update as never)
      .eq("id", prizeId)
      .eq("tournament_id", tournamentId)
      .select()
      .single();
    if (error) throw new MpError("PRIZE.UPDATE_FAILED", error.message, 500);
    return mapPrize(data as unknown as Record<string, unknown>);
  });
}

const DeletePrizeSchema = z.object({
  tournamentId: UuidSchema,
  prizeId: UuidSchema,
});

export async function deleteTournamentPrize(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(DeletePrizeSchema, input, async ({ tournamentId, prizeId }) => {
    const editor = await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    await setAuditActor(admin, editor.userId, editor.actorRole);
    const { error } = await admin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tournament_prizes" as any)
      .delete()
      .eq("id", prizeId)
      .eq("tournament_id", tournamentId);
    if (error) throw new MpError("PRIZE.DELETE_FAILED", error.message, 500);
    return { id: prizeId };
  });
}
