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

    // Welcome DM del perfil MATCHPOINT. Fire-and-forget; si falla NO rompe
    // el signup. El killswitch system_messages_enabled lo apaga global.
    try {
      const { sendSystemMessage, renderTemplate } = await import("@/lib/messages/system");
      const firstName = data.displayName.split(" ")[0] || "jugador";
      await sendSystemMessage({
        recipientUserId: signUpData.user.id,
        kind: "welcome_signup",
        body: renderTemplate("welcome_signup", { firstName }),
      });
    } catch (e) {
      console.error("[auth.signUp] welcome message failed", e);
    }

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
    if (data.firstName !== undefined) payload.first_name = data.firstName;
    if (data.lastName !== undefined) payload.last_name = data.lastName;
    if (data.avatarUrl !== undefined) payload.avatar_url = data.avatarUrl;
    if (data.bio !== undefined) payload.bio = data.bio;
    if (data.country !== undefined) payload.country = data.country;
    if (data.city !== undefined) payload.city = data.city;
    if (data.birthdate !== undefined) payload.birthdate = data.birthdate;
    if (data.phone !== undefined) payload.phone = data.phone;
    if (data.dominantHand !== undefined) payload.dominant_hand = data.dominantHand;
    if (data.preferredSport !== undefined) payload.preferred_sport = data.preferredSport;
    if (data.skillLevel !== undefined) payload.skill_level = data.skillLevel;
    // Customización: updateProfile genérico permite editar accent/banner/card
    // (path admin/legacy). El path normal del user pasa por
    // setProfileCustomization() en src/server/actions/profile-customization.ts,
    // que gatea MP+ antes de mutar.
    if (data.accentColor !== undefined) payload.accent_color = data.accentColor;
    if (data.bannerPreset !== undefined) payload.banner_preset = data.bannerPreset;
    if (data.cardStyle !== undefined) payload.card_style = data.cardStyle;
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
  // Cookie value puede traer string vacío o stale no-UUID — normalizamos a
  // null para que UuidSchema.nullable() no truene en SessionResponseSchema.parse.
  const rawClubId = c.get(ACTIVE_CLUB_COOKIE)?.value;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const activeClubId = rawClubId && UUID_RE.test(rawClubId) ? rawClubId : null;

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

function toIso(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") {
    // Postgres timestamptz puede venir como "2026-05-19 14:24:33+00" (espacio,
    // sin .ms, offset corto). Zod .datetime({offset:true}) exige ISO estricto
    // con "T". Normalizamos vía Date para no fallar la validación.
    const d = new Date(v.includes("T") ? v : v.replace(" ", "T"));
    return isNaN(d.getTime()) ? v : d.toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function mapProfile(row: Record<string, unknown>): Profile {
  return ProfileSchema.parse({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    country: row.country ?? null,
    city: row.city ?? null,
    birthdate: row.birthdate ?? null,
    phone: row.phone ?? null,
    dominantHand: row.dominant_hand ?? null,
    preferredSport: row.preferred_sport ?? null,
    skillLevel: row.skill_level ?? null,
    accentColor: row.accent_color ?? null,
    bannerPreset: row.banner_preset ?? null,
    cardStyle: row.card_style ?? null,
    locale: row.locale ?? "es",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

// ── Form helpers (used by /login and /signup pages) ─────────────────────
//
// Post-auth redirect:
//   · Signup: SIEMPRE pasa por /onboarding (es flow obligatorio para users
//     nuevos). El `next` original viaja como query param y el wizard
//     redirige ahí al terminar.
//   · Signin: si profiles.onboarded_at IS NULL → /onboarding?next=... (user
//     viejo que nunca completó). Si ya está onboardeado → next directo.
//   · Fallback de next: /dashboard/user.
function buildPostAuthRedirect(next: string, needsOnboarding: boolean): string {
  if (needsOnboarding) {
    return `/onboarding?next=${encodeURIComponent(next)}`;
  }
  return next;
}

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
    // signup ⇒ user nuevo ⇒ siempre onboarding.
    redirect(buildPostAuthRedirect(next, true));
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
    // signin ⇒ verificar si ya completó onboarding.
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    let needsOnboarding = false;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("id", user.id)
        .maybeSingle();
      needsOnboarding = profile != null && profile.onboarded_at == null;
    }
    redirect(buildPostAuthRedirect(next, needsOnboarding));
  }
  return result;
}

export async function signOutAndRedirect() {
  await signOut();
  redirect("/login");
}
