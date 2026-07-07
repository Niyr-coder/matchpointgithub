"use server";

// Coach reads: list + detail. Profile updates by the coach themselves come later.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import {
  CoachDetailSchema,
  CoachListParamsSchema,
  CoachProfileSchema,
  type CoachDetail,
  type CoachProfile,
} from "@/lib/schemas/coaches";
import { UuidSchema } from "@/lib/schemas/common";

function mapProfile(row: Record<string, unknown>, identity: Record<string, unknown> | null): CoachProfile {
  return CoachProfileSchema.parse({
    id: row.id,
    displayName: identity?.display_name ?? "",
    avatarUrl: (identity?.avatar_url as string | null) ?? null,
    city: (identity?.city as string | null) ?? null,
    headline: row.headline ?? null,
    bio: row.bio ?? null,
    yearsExperience: row.years_experience ?? null,
    hourlyRateCents: row.hourly_rate_cents ?? null,
    currency: row.currency ?? null,
    introVideoUrl: row.intro_video_url ?? null,
    verifiedAt: row.verified_at ?? null,
    ratingAvg: row.rating_avg !== null && row.rating_avg !== undefined ? Number(row.rating_avg) : null,
    ratingCount: row.rating_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

// ── updateCoachProfile (coach acts on own profile) ─────────────────────
import { AuthError } from "@/lib/auth/session";

const UpdateProfileSchema = z.object({
  headline: z.string().max(160).optional(),
  bio: z.string().max(2000).optional(),
  yearsExperience: z.number().int().min(0).max(80).optional(),
  hourlyRateCents: z.number().int().min(0).optional(),
  currency: z.string().optional(),
  introVideoUrl: z.string().url().optional(),
  primarySport: z.enum(["pickleball", "padel", "tenis"]).optional(),
});

export async function updateCoachProfile(
  input: unknown,
): Promise<ActionResult<CoachProfile>> {
  return runAction(UpdateProfileSchema, input, async (patch) => {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");

    const payload: Record<string, unknown> = {};
    if (patch.headline !== undefined) payload.headline = patch.headline;
    if (patch.bio !== undefined) payload.bio = patch.bio;
    if (patch.yearsExperience !== undefined) payload.years_experience = patch.yearsExperience;
    if (patch.hourlyRateCents !== undefined) payload.hourly_rate_cents = patch.hourlyRateCents;
    if (patch.currency !== undefined) payload.currency = patch.currency;
    if (patch.introVideoUrl !== undefined) payload.intro_video_url = patch.introVideoUrl;
    if (patch.primarySport !== undefined) payload.primary_sport = patch.primarySport;

    const { data, error } = await supabase
      .from("coach_profiles")
      .update(payload as never)
      .eq("id", user.id)
      .select()
      .single();
    if (error || !data) throw new MpError("COACHES.UPDATE_FAILED", error?.message ?? "fail", 500);
    const { data: identity } = await supabase
      .from("profiles")
      .select("display_name,avatar_url,city")
      .eq("id", user.id)
      .single();
    return mapProfile(data, identity ?? null);
  });
}

// ── listCoaches (public) ───────────────────────────────────────────────
export async function listCoaches(input: unknown): Promise<ActionResult<CoachProfile[]>> {
  return runAction(CoachListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    // Start from coach_profiles, then join identity per row.
    let q = supabase
      .from("coach_profiles")
      .select("*")
      .order("rating_avg", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (params.clubId) {
      const { data: links } = await supabase
        .from("coach_clubs")
        .select("coach_id")
        .eq("club_id", params.clubId)
        .eq("active", true);
      const ids = (links ?? []).map((l) => l.coach_id as string);
      if (ids.length === 0) return [];
      q = q.in("id", ids);
    }
    if (params.sport || params.specialty) {
      let sq = supabase.from("coach_specialties").select("coach_id");
      if (params.sport) sq = sq.eq("sport", params.sport);
      if (params.specialty) sq = sq.ilike("specialty", `%${params.specialty}%`);
      const { data: rows } = await sq;
      const ids = (rows ?? []).map((r) => r.coach_id as string);
      if (ids.length === 0) return [];
      q = q.in("id", ids);
    }

    const { data: profiles, error } = await q;
    if (error) throw new MpError("COACHES.DB_ERROR", error.message, 500);
    const coachIds = (profiles ?? []).map((p) => p.id as string);
    if (coachIds.length === 0) return [];

    const { data: identities } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url,city")
      .in("id", coachIds);
    const idMap = new Map((identities ?? []).map((i) => [i.id as string, i]));

    let result = (profiles ?? []).map((p) => mapProfile(p, idMap.get(p.id as string) ?? null));
    if (params.q) {
      const needle = params.q.toLowerCase();
      result = result.filter((c) =>
        c.displayName.toLowerCase().includes(needle) ||
        (c.headline ?? "").toLowerCase().includes(needle),
      );
    }
    return result;
  });
}

// ── getCoach (public) ──────────────────────────────────────────────────
export async function getCoach(input: unknown): Promise<ActionResult<CoachDetail>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const [
      { data: profile, error },
      { data: identity },
      { data: specialties },
      { data: availability },
      { data: certs },
      { data: reviews },
      { data: clubLinks },
    ] = await Promise.all([
      supabase.from("coach_profiles").select("*").eq("id", id).single(),
      supabase.from("profiles").select("display_name,avatar_url,city").eq("id", id).single(),
      supabase.from("coach_specialties").select("*").eq("coach_id", id),
      supabase.from("coach_availability").select("*").eq("coach_id", id).order("day_of_week"),
      supabase.from("coach_certifications").select("*").eq("coach_id", id),
      supabase
        .from("coach_reviews")
        .select("*")
        .eq("coach_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("coach_clubs").select("club_id").eq("coach_id", id).eq("active", true),
    ]);

    if (error || !profile) throw new MpError("COACHES.NOT_FOUND", "Coach not found", 404);

    const detail: CoachDetail = {
      coach: mapProfile(profile, identity ?? null),
      specialties: (specialties ?? []).map((s) => ({
        sport: s.sport,
        specialty: s.specialty,
        proficiency: s.proficiency,
      })),
      availability: (availability ?? []).map((a) => ({
        id: a.id,
        clubId: (a.club_id as string | null) ?? null,
        dayOfWeek: a.day_of_week,
        startsAt: a.starts_at,
        endsAt: a.ends_at,
      })),
      certifications: (certs ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        issuer: c.issuer ?? null,
        issuedYear: c.issued_year ?? null,
        documentUrl: c.document_url ?? null,
        verifiedAt: c.verified_at ?? null,
      })),
      reviews: (reviews ?? [])
        // reviewer_id es nullable en DB (reseñas de cuentas borradas); el
        // contrato del detalle exige reviewer, así que se omiten esas filas.
        .filter((r) => r.reviewer_id != null)
        .map((r) => ({
          id: r.id,
          reviewerId: r.reviewer_id as string,
          rating: r.rating,
          comment: r.comment ?? null,
          createdAt: r.created_at,
        })),
      clubIds: (clubLinks ?? []).map((l) => l.club_id as string),
    };
    return CoachDetailSchema.parse(detail);
  });
}
