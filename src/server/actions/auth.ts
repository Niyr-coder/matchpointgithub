"use server";

// Identity / auth Server Actions. Used directly by Server Components,
// Client Components via form submission, and the /api/v1/auth/* Route Handlers.
import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { assertRateLimit, RATE_LIMITS } from "@/lib/api/ratelimit";
import { AuthError, ACTIVE_CLUB_COOKIE, ACTIVE_ROLE_COOKIE } from "@/lib/auth/session";

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
import {
  ProfileSchema,
  ProfileUpdateSchema,
  SessionResponseSchema,
  SignInSchema,
  SignUpSchema,
  SwitchRoleSchema,
  type Profile,
  type RoleAssignment,
  type SessionResponse,
} from "@/lib/schemas/identity";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

// ── signUp ──────────────────────────────────────────────────────────────
export async function signUp(input: unknown): Promise<ActionResult<SessionResponse>> {
  return runAction(SignUpSchema, input, async (data) => {
    await assertRateLimit({
      key: `auth:signup:${await clientIp()}`,
      ...RATE_LIMITS.authSensitive,
    });
    const supabase = await getServerClient();

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          username: data.username,
          display_name: data.displayName,
          locale: data.locale ?? "es",
        },
      },
    });

    if (error) {
      // Supabase returns specific codes for the most common failures.
      if (error.message.toLowerCase().includes("registered")) {
        throw new MpError("AUTH.EMAIL_TAKEN", "Email already registered", 409);
      }
      throw new MpError("AUTH.SIGNUP_FAILED", error.message, 400);
    }

    if (!signUpData.user) {
      throw new MpError("AUTH.SIGNUP_PENDING", "Confirm your email to finish sign-up", 202);
    }

    // Trigger tg_handle_new_auth_user already inserted profile + role 'user'.
    // Default the active role cookie so the dashboard works on first load.
    const c = await cookies();
    c.set(ACTIVE_ROLE_COOKIE, "user", COOKIE_OPTS);
    c.delete(ACTIVE_CLUB_COOKIE);

    return await buildSession();
  });
}

// ── signIn ──────────────────────────────────────────────────────────────
export async function signIn(input: unknown): Promise<ActionResult<SessionResponse>> {
  return runAction(SignInSchema, input, async (data) => {
    await assertRateLimit({
      key: `auth:signin:${await clientIp()}`,
      ...RATE_LIMITS.authSensitive,
    });
    const supabase = await getServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      throw new MpError("AUTH.INVALID_CREDENTIALS", "Email or password incorrect", 401);
    }

    const session = await buildSession();

    // Default active role to first assignment if cookie missing.
    const c = await cookies();
    if (!c.get(ACTIVE_ROLE_COOKIE)?.value && session.roles[0]) {
      c.set(ACTIVE_ROLE_COOKIE, session.roles[0].role, COOKIE_OPTS);
      if (session.roles[0].clubId) {
        c.set(ACTIVE_CLUB_COOKIE, session.roles[0].clubId, COOKIE_OPTS);
      }
    }

    return await buildSession();
  });
}

// ── signOut ─────────────────────────────────────────────────────────────
export async function signOut(): Promise<ActionResult<{ ok: true }>> {
  return runAction(SwitchRoleSchema.optional(), undefined, async () => {
    const supabase = await getServerClient();
    await supabase.auth.signOut();
    const c = await cookies();
    c.delete(ACTIVE_ROLE_COOKIE);
    c.delete(ACTIVE_CLUB_COOKIE);
    return { ok: true as const };
  });
}

// ── switchRole ──────────────────────────────────────────────────────────
export async function switchRole(input: unknown): Promise<ActionResult<SessionResponse>> {
  return runAction(SwitchRoleSchema, input, async (data) => {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");

    const { data: assignments, error } = await supabase
      .from("role_assignments")
      .select("role,club_id,partner_id")
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (error) throw new MpError("AUTH.DB_ERROR", error.message, 500);

    const match = (assignments ?? []).find(
      (a) =>
        a.role === data.role &&
        (data.clubId ? a.club_id === data.clubId : a.club_id === null || data.role === "admin" || data.role === "user" || data.role === "partner") &&
        (data.partnerId ? a.partner_id === data.partnerId : true),
    );
    if (!match) {
      throw new AuthError("AUTH.ROLE_REQUIRED", `Role '${data.role}' not granted to user`);
    }

    const c = await cookies();
    c.set(ACTIVE_ROLE_COOKIE, data.role, COOKIE_OPTS);
    if (data.clubId) c.set(ACTIVE_CLUB_COOKIE, data.clubId, COOKIE_OPTS);
    else c.delete(ACTIVE_CLUB_COOKIE);

    return await buildSession();
  });
}

// ── updateProfile ───────────────────────────────────────────────────────
export async function updateProfile(input: unknown): Promise<ActionResult<Profile>> {
  return runAction(ProfileUpdateSchema, input, async (data) => {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");

    const payload: Record<string, unknown> = {};
    if (data.displayName !== undefined) payload.display_name = data.displayName;
    if (data.avatarUrl !== undefined) payload.avatar_url = data.avatarUrl;
    if (data.bio !== undefined) payload.bio = data.bio;
    if (data.country !== undefined) payload.country = data.country;
    if (data.city !== undefined) payload.city = data.city;
    if (data.preferredSport !== undefined) payload.preferred_sport = data.preferredSport;
    if (data.skillLevel !== undefined) payload.skill_level = data.skillLevel;
    if (data.locale !== undefined) payload.locale = data.locale;

    const { data: updated, error } = await supabase
      .from("profiles")
      .update(payload as never)
      .eq("id", user.id)
      .select()
      .single();

    if (error) throw new MpError("PROFILE.UPDATE_FAILED", error.message, 400);
    return mapProfile(updated);
  });
}

// ── Internal: build canonical session response ──────────────────────────
async function buildSession(): Promise<SessionResponse> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");

  const [{ data: profile, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("role_assignments")
      .select("role,club_id,partner_id,granted_at")
      .eq("user_id", user.id)
      .is("revoked_at", null),
  ]);

  if (pErr || !profile) throw new MpError("PROFILE.NOT_FOUND", "Profile not found", 404);
  if (rErr) throw new MpError("AUTH.DB_ERROR", rErr.message, 500);

  const c = await cookies();
  const activeRole = (c.get(ACTIVE_ROLE_COOKIE)?.value as RoleAssignment["role"] | undefined) ?? null;
  const activeClubId = c.get(ACTIVE_CLUB_COOKIE)?.value ?? null;

  const response: SessionResponse = {
    user: mapProfile(profile),
    activeRole,
    activeClubId,
    roles: (roles ?? []).map((r) => ({
      role: r.role as RoleAssignment["role"],
      clubId: (r.club_id ?? null) as string | null,
      partnerId: (r.partner_id ?? null) as string | null,
      grantedAt: r.granted_at as string,
    })),
  };

  // Validate before returning so callers can trust the contract.
  return SessionResponseSchema.parse(response);
}

function mapProfile(row: Record<string, unknown>): Profile {
  return ProfileSchema.parse({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    country: row.country ?? null,
    city: row.city ?? null,
    preferredSport: row.preferred_sport ?? null,
    skillLevel: row.skill_level ?? null,
    locale: row.locale ?? "es",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

// ── Form helpers (used by /login and /signup pages) ─────────────────────
export async function signUpFromForm(prevState: unknown, formData: FormData) {
  const result = await signUp({
    email: formData.get("email"),
    password: formData.get("password"),
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    locale: formData.get("locale") ?? undefined,
  });
  if (result.ok) {
    const next = (formData.get("next") as string) || "/dashboard/user";
    redirect(next);
  }
  return result;
}

export async function signInFromForm(prevState: unknown, formData: FormData) {
  const result = await signIn({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (result.ok) {
    const next = (formData.get("next") as string) || "/dashboard/user";
    redirect(next);
  }
  return result;
}

export async function signOutAndRedirect() {
  await signOut();
  redirect("/login");
}
