// GET /api/v1/me — returns the canonical session shape (profile + roles + active scope).
import { getServerClient } from "@/lib/db/client.server";
import { httpFail, httpOk } from "@/lib/api/response";
import { cookies } from "next/headers";
import {
  ACTIVE_CLUB_COOKIE,
  ACTIVE_ROLE_COOKIE,
} from "@/lib/auth/session";
import {
  ProfileSchema,
  SessionResponseSchema,
  type RoleAssignment,
  type SessionResponse,
} from "@/lib/schemas/identity";

export async function GET() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return httpFail(401, "AUTH.UNAUTHENTICATED", "Sign in required");

  const [{ data: profile, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("role_assignments")
      .select("role,club_id,partner_id,granted_at")
      .eq("user_id", user.id)
      .is("revoked_at", null),
  ]);

  if (pErr || !profile) return httpFail(404, "PROFILE.NOT_FOUND", "Profile not found");
  if (rErr) return httpFail(500, "AUTH.DB_ERROR", rErr.message);

  const c = await cookies();
  const activeRole = (c.get(ACTIVE_ROLE_COOKIE)?.value as RoleAssignment["role"] | undefined) ?? null;
  const rawClubId = c.get(ACTIVE_CLUB_COOKIE)?.value;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const activeClubId = rawClubId && UUID_RE.test(rawClubId) ? rawClubId : null;

  const p = profile as Record<string, unknown>;
  const response: SessionResponse = {
    user: ProfileSchema.parse({
      id: p.id,
      username: p.username,
      displayName: p.display_name,
      firstName: p.first_name ?? null,
      lastName: p.last_name ?? null,
      avatarUrl: p.avatar_url ?? null,
      bio: p.bio ?? null,
      country: p.country ?? null,
      city: p.city ?? null,
      birthdate: p.birthdate ?? null,
      phone: p.phone ?? null,
      dominantHand: p.dominant_hand ?? null,
      preferredSport: p.preferred_sport ?? null,
      skillLevel: p.skill_level ?? null,
      accentColor: p.accent_color ?? null,
      bannerPreset: p.banner_preset ?? null,
      cardStyle: p.card_style ?? null,
      locale: p.locale ?? "es",
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }),
    activeRole,
    activeClubId,
    roles: (roles ?? []).map((r) => ({
      role: r.role as RoleAssignment["role"],
      clubId: (r.club_id ?? null) as string | null,
      partnerId: (r.partner_id ?? null) as string | null,
      grantedAt: r.granted_at as string,
    })),
  };

  return httpOk(SessionResponseSchema.parse(response));
}
