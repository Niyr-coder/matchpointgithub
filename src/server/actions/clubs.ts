"use server";

// Club domain Server Actions (post-approval entities).
// See docs/architecture/40-api.md §3.1.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { runOptimisticUpdate } from "@/lib/api/optimisticLock";
import {
  ClubDetailSchema,
  ClubFeaturedSchema,
  ClubListParamsSchema,
  ClubReviewCreateSchema,
  ClubReviewSchema,
  ClubReviewStatsSchema,
  ClubSchema,
  ClubUpdateSchema,
  type Club,
  type ClubDetail,
  type ClubFeatured,
  type ClubReview,
  type ClubReviewStats,
} from "@/lib/schemas/clubs";
import type { PageMeta } from "@/lib/api/response";
import { UuidSchema } from "@/lib/schemas/common";

function mapClub(row: Record<string, unknown>): Club {
  return ClubSchema.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    logoUrl: row.logo_url ?? null,
    coverUrl: row.cover_url ?? null,
    country: row.country,
    city: row.city,
    address: row.address ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    timezone: row.timezone,
    currency: row.currency,
    sports: row.sports ?? [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version ?? 1,
  });
}

async function requireSession() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

async function requireClubStaff(clubId: string): Promise<void> {
  const userId = await requireSession();
  const supabase = await getServerClient();
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", userId)
    .is("revoked_at", null);

  const staff = (roles ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId && (r.role === "owner" || r.role === "manager")),
  );
  if (!staff) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff role required");
}

// ── listClubs (public) ──────────────────────────────────────────────────
export async function listClubs(
  input: unknown,
): Promise<ActionResult<Club[]> & { meta?: PageMeta }> {
  return runAction(ClubListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let q = supabase
      .from("clubs")
      .select("*", { count: "exact" })
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (params.q) q = q.ilike("name", `%${params.q}%`);
    if (params.country) q = q.eq("country", params.country);
    if (params.city) q = q.ilike("city", `%${params.city}%`);
    if (params.sport) q = q.contains("sports", [params.sport]);

    const { data, error, count } = await q;
    if (error) throw new MpError("CLUBS.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapClub);
  });
}

// ── listFeaturedClubs (public, for landing) ─────────────────────────────
const FeaturedParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(4),
});

export async function listFeaturedClubs(
  input: unknown = {},
): Promise<ActionResult<ClubFeatured[]>> {
  return runAction(FeaturedParamsSchema, input, async ({ limit }) => {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("clubs_public_summary")
      .select("*")
      .order("courts_count", { ascending: false })
      .limit(limit);
    if (error) throw new MpError("CLUBS.DB_ERROR", error.message, 500);

    const rows = data ?? [];
    if (rows.length === 0) return [];

    // featured_until + description + address viven en la tabla `clubs`
    // (no en la vista pública). Lo traemos en un segundo query y unimos.
    const ids = rows.map((r) => r.id as string);
    const { data: extraRows } = await supabase
      .from("clubs")
      .select("id,featured_until,description,address")
      .in("id", ids);
    type Extra = { featuredUntil: string | null; description: string | null; address: string | null };
    const extraById = new Map<string, Extra>();
    for (const f of extraRows ?? []) {
      const fid = f.id as string;
      const until = (f.featured_until as string | null) ?? null;
      // Tratamos como null si ya expiró: la UI no debe destacarlo.
      const stillActive = until != null && new Date(until) > new Date();
      extraById.set(fid, {
        featuredUntil: stillActive ? until : null,
        description: (f.description as string | null) ?? null,
        address: (f.address as string | null) ?? null,
      });
    }

    return rows.map((row) => {
      const extra = extraById.get(row.id as string);
      return ClubFeaturedSchema.parse({
        id: row.id,
        slug: row.slug,
        name: row.name,
        city: row.city,
        coverUrl: row.cover_url ?? null,
        sports: row.sports ?? [],
        currency: row.currency,
        courtsCount: row.courts_count ?? 0,
        minPriceCents: row.min_price_cents ?? null,
        description: extra?.description ?? null,
        address: extra?.address ?? null,
        featuredUntil: extra?.featuredUntil ?? null,
      });
    });
  });
}

// ── getClub (public) ────────────────────────────────────────────────────
const GetSchema = z.object({ idOrSlug: z.string() });

export async function getClub(input: unknown): Promise<ActionResult<ClubDetail>> {
  return runAction(GetSchema, input, async ({ idOrSlug }) => {
    const supabase = await getServerClient();
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);

    const clubQuery = isUuid
      ? supabase.from("clubs").select("*").eq("id", idOrSlug).single()
      : supabase.from("clubs").select("*").eq("slug", idOrSlug).single();

    const { data: club, error } = await clubQuery;
    if (error || !club) throw new MpError("CLUBS.NOT_FOUND", "Club not found", 404);

    const [{ data: settings }, { data: amenities }, { data: photos }] = await Promise.all([
      supabase.from("club_settings").select("*").eq("club_id", club.id).maybeSingle(),
      supabase.from("club_amenities").select("amenity").eq("club_id", club.id),
      supabase.from("club_photos").select("*").eq("club_id", club.id).order("ordinal"),
    ]);

    const detail: ClubDetail = {
      club: mapClub(club),
      settings: settings
        ? {
            reservationWindowDays: settings.reservation_window_days,
            cancellationWindowHours: settings.cancellation_window_hours,
            defaultSlotMinutes: settings.default_slot_minutes,
            allowWalkins: settings.allow_walkins,
            chargeNoShowPct: settings.charge_no_show_pct,
            openHours: (settings.open_hours ?? {}) as Record<string, unknown>,
          }
        : null,
      amenities: (amenities ?? []).map((a) => a.amenity as string),
      photos: (photos ?? []).map((p) => ({
        id: p.id,
        url: p.url,
        caption: p.caption ?? null,
        ordinal: p.ordinal,
      })),
    };
    return ClubDetailSchema.parse(detail);
  });
}

// ── suspendClub / activateClub (admin only) ────────────────────────────
async function requireAdmin(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Admin required");
  return user.id;
}

export async function suspendClub(input: unknown): Promise<ActionResult<Club>> {
  return runAction(z.object({ clubId: UuidSchema }), input, async ({ clubId }) => {
    await requireAdmin();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("clubs")
      .update({ status: "suspended" } as never)
      .eq("id", clubId)
      .select()
      .single();
    if (error || !data) throw new MpError("CLUBS.UPDATE_FAILED", error?.message ?? "fail", 500);
    return mapClub(data);
  });
}

export async function activateClub(input: unknown): Promise<ActionResult<Club>> {
  return runAction(z.object({ clubId: UuidSchema }), input, async ({ clubId }) => {
    await requireAdmin();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("clubs")
      .update({ status: "active" } as never)
      .eq("id", clubId)
      .select()
      .single();
    if (error || !data) throw new MpError("CLUBS.UPDATE_FAILED", error?.message ?? "fail", 500);
    return mapClub(data);
  });
}

// ── updateClub (owner/admin) ────────────────────────────────────────────
const UpdateSchema = z.object({
  clubId: UuidSchema,
  patch: ClubUpdateSchema,
});

export async function updateClub(input: unknown): Promise<ActionResult<Club>> {
  return runAction(UpdateSchema, input, async ({ clubId, patch }) => {
    await requireClubStaff(clubId);

    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.logoUrl !== undefined) payload.logo_url = patch.logoUrl;
    if (patch.coverUrl !== undefined) payload.cover_url = patch.coverUrl;
    if (patch.address !== undefined) payload.address = patch.address;
    if (patch.phone !== undefined) payload.phone = patch.phone;
    if (patch.email !== undefined) payload.email = patch.email;
    if (patch.sports !== undefined) payload.sports = patch.sports;

    const row = await runOptimisticUpdate({
      table: "clubs",
      id: clubId,
      expectedVersion: patch.expectedVersion,
      update: payload,
    });
    return mapClub(row);
  });
}

// ── club reviews ────────────────────────────────────────────────────────
async function requireUserIdForReview(): Promise<string> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

export async function listClubReviews(input: unknown): Promise<ActionResult<ClubReview[]>> {
  return runAction(z.object({ clubId: UuidSchema, limit: z.coerce.number().int().min(1).max(50).default(20) }), input, async ({ clubId, limit }) => {
    const supabase = await getServerClient();
    const { data: rows, error } = await supabase
      .from("club_reviews")
      .select("id,club_id,user_id,rating,comment,created_at,profiles!club_reviews_user_id_fkey(display_name,avatar_url)")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new MpError("REVIEWS.DB_ERROR", error.message, 500);
    return (rows ?? []).map((r) => {
      const prof = r.profiles as { display_name?: string; avatar_url?: string | null } | null;
      return ClubReviewSchema.parse({
        id: r.id,
        clubId: r.club_id,
        userId: r.user_id,
        userDisplayName: prof?.display_name ?? "Usuario",
        userAvatarUrl: prof?.avatar_url ?? null,
        rating: r.rating,
        comment: r.comment ?? null,
        createdAt: r.created_at,
      });
    });
  });
}

export async function getClubReviewStats(input: unknown): Promise<ActionResult<Map<string, ClubReviewStats>>> {
  return runAction(z.object({ clubIds: z.array(UuidSchema).min(1).max(50) }), input, async ({ clubIds }) => {
    const supabase = await getServerClient();
    const { data, error } = await supabase.rpc("get_club_review_stats", { p_club_ids: clubIds });
    if (error) throw new MpError("REVIEWS.STATS_FAILED", error.message, 500);
    const out = new Map<string, ClubReviewStats>();
    for (const row of data ?? []) {
      out.set(row.club_id as string, ClubReviewStatsSchema.parse({
        avgRating: Number(row.avg_rating),
        reviewsCount: Number(row.reviews_count),
      }));
    }
    return out;
  });
}

export async function createClubReview(input: unknown): Promise<ActionResult<ClubReview>> {
  return runAction(ClubReviewCreateSchema, input, async ({ clubId, rating, comment }) => {
    const userId = await requireUserIdForReview();
    const supabase = await getServerClient();
    // Tabla original tiene unique(club_id, user_id, reservation_id). Para reviews
    // generales (sin reserva) usamos null como reservation_id → upsert por par (club, user).
    const { data, error } = await supabase
      .from("club_reviews")
      .upsert({
        club_id: clubId,
        user_id: userId,
        rating,
        comment: comment ?? null,
        reservation_id: null,
      } as never, { onConflict: "club_id,user_id,reservation_id" })
      .select("id,club_id,user_id,rating,comment,created_at,profiles!club_reviews_user_id_fkey(display_name,avatar_url)")
      .single();
    if (error) throw new MpError("REVIEWS.WRITE_FAILED", error.message, 500);
    const prof = (data as { profiles?: { display_name?: string; avatar_url?: string | null } }).profiles ?? null;
    return ClubReviewSchema.parse({
      id: data.id,
      clubId: data.club_id,
      userId: data.user_id,
      userDisplayName: prof?.display_name ?? "Usuario",
      userAvatarUrl: prof?.avatar_url ?? null,
      rating: data.rating,
      comment: data.comment ?? null,
      createdAt: data.created_at,
    });
  });
}
