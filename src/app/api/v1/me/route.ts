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
  const activeClubId = c.get(ACTIVE_CLUB_COOKIE)?.value ?? null;

  const response: SessionResponse = {
    user: ProfileSchema.parse({
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url ?? null,
      bio: profile.bio ?? null,
      country: profile.country ?? null,
      city: profile.city ?? null,
      preferredSport: profile.preferred_sport ?? null,
      skillLevel: profile.skill_level ?? null,
      locale: profile.locale ?? "es",
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
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
