"use server";

// Identity / auth Server Actions. Used directly by Server Components,
// Client Components via form submission, and the /api/v1/auth/* Route Handlers.
import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { fail } from "@/lib/api/response";
import { MpError } from "@/lib/api/errors";
import { assertRateLimit, RATE_LIMITS } from "@/lib/api/ratelimit";
import { AuthError, ACTIVE_CLUB_COOKIE, ACTIVE_ROLE_COOKIE } from "@/lib/auth/session";
import { ROLE_LOGIN_PRIORITY } from "@/lib/auth/role-route-guard";
import { areSignupsClosed, buildPostAuthRedirect, safeOAuthNext } from "@/lib/auth/oauth";
import { parsePersonName } from "@/lib/identity/person-name";
import type { RoleKey } from "@/lib/roles";

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
  RequestPasswordResetSchema,
  SessionResponseSchema,
  SignInSchema,
  SignUpSchema,
  SwitchRoleSchema,
  UpdatePasswordSchema,
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

// Traducción de errores Supabase auth → MpError con copy en español. El SDK
// expone `error.code` con el código canónico (weak_password,
// over_email_send_rate_limit, etc); ver
// https://supabase.com/docs/reference/javascript/auth-error-codes.
// Antes envolvíamos todo en un genérico "No pudimos crear tu cuenta…" que
// ocultaba la causa real (rate-limit de SMTP, email inválido, password débil).
type SupabaseAuthErrorShape = {
  message?: string;
  code?: string;
  status?: number;
};

function mapSupabaseAuthError(
  error: SupabaseAuthErrorShape,
  action: "signUp" | "signIn" | "updatePassword",
): MpError {
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();

  // Rate limiting: el más común en prod cuando Supabase usa el SMTP por
  // defecto (cap ~3-4 emails/hora). Mismo trato para SMS.
  if (code === "over_email_send_rate_limit" || code === "over_sms_send_rate_limit") {
    return new MpError(
      "AUTH.EMAIL_RATE_LIMIT",
      "Estamos enviando demasiados correos ahora mismo. Espera unos minutos y vuelve a intentar.",
      429,
    );
  }
  if (code === "over_request_rate_limit") {
    return new MpError(
      "AUTH.RATE_LIMIT",
      "Estás haciendo muchos intentos. Espera un minuto y vuelve a intentar.",
      429,
    );
  }

  // Password débil: surfaceamos a nivel de campo para que el form la marque.
  if (code === "weak_password") {
    return new MpError(
      "AUTH.WEAK_PASSWORD",
      "Tu contraseña es muy débil. Usa al menos 8 caracteres con letras y números.",
      422,
      { password: ["Muy débil. Usa al menos 8 caracteres con letras y números."] },
    );
  }

  // Email mal formado o rechazado (incluye disposable / dominio inválido). El
  // legacy code "validation_failed" lo emite la REST API directa.
  if (
    code === "email_address_invalid" ||
    (code === "validation_failed" && msg.includes("email"))
  ) {
    return new MpError(
      "AUTH.EMAIL_INVALID",
      "El correo no parece válido. Revisa la dirección e inténtalo de nuevo.",
      400,
      { email: ["El correo no parece válido."] },
    );
  }

  // Email ya registrado. Conservamos el match por mensaje "registered" como
  // fallback porque versiones viejas del SDK no exponen error.code.
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    msg.includes("registered")
  ) {
    return new MpError(
      "AUTH.EMAIL_TAKEN",
      "Este correo ya está registrado. Inicia sesión o usa otro.",
      409,
      { email: ["Ya existe una cuenta con este correo."] },
    );
  }

  // Signups deshabilitados a nivel de proyecto Supabase (no nuestro feature
  // flag, que ya gateamos arriba). Status 403 como el handler de signups_open.
  if (code === "signup_disabled") {
    return new MpError(
      "AUTH.SIGNUPS_CLOSED",
      "Los registros están deshabilitados temporalmente. Vuelve a intentarlo más tarde.",
      403,
    );
  }

  if (code === "captcha_failed") {
    return new MpError(
      "AUTH.CAPTCHA_FAILED",
      "La verificación anti-bot falló. Recarga la página e inténtalo de nuevo.",
      400,
    );
  }

  if (action === "signIn") {
    if (
      code === "invalid_credentials" ||
      code === "invalid_grant" ||
      msg.includes("invalid login")
    ) {
      return new MpError(
        "AUTH.INVALID_CREDENTIALS",
        "Correo o contraseña incorrectos.",
        401,
      );
    }
    if (code === "email_not_confirmed") {
      return new MpError(
        "AUTH.EMAIL_NOT_CONFIRMED",
        "Tu correo aún no está confirmado. Revisa tu bandeja de entrada.",
        401,
      );
    }
    // signIn fallback: por seguridad/anti-enumeración no exponemos la causa
    // exacta — el resto se mapea a "credenciales incorrectas".
    return new MpError(
      "AUTH.INVALID_CREDENTIALS",
      "Correo o contraseña incorrectos.",
      401,
    );
  }

  if (action === "updatePassword") {
    return new MpError(
      "AUTH.PASSWORD_UPDATE_FAILED",
      "No pudimos actualizar tu contraseña. Inténtalo de nuevo.",
      400,
    );
  }

  // signUp catchall: loggeamos para detectar nuevos códigos no mapeados.
  console.error("[auth.signUp] unmapped Supabase error", {
    code: error.code,
    status: error.status,
    message: error.message,
  });
  return new MpError(
    "AUTH.SIGNUP_FAILED",
    "No pudimos crear tu cuenta. Revisa los datos e inténtalo de nuevo.",
    400,
  );
}

// ── signUp ──────────────────────────────────────────────────────────────
export async function signUp(input: unknown): Promise<ActionResult<SessionResponse>> {
  return runAction(SignUpSchema, input, async (data) => {
    await assertRateLimit({
      key: `auth:signup:${await clientIp()}`,
      ...RATE_LIMITS.authSensitive,
      failClosed: true,
    });

    // Feature flag global: signups_open. Lectura con service-role porque el
    // usuario anónimo no pasa la RLS de feature_flags. Off explícito = cerrado.
    const { data: signupsFlag } = await getAdminClient()
      .from("feature_flags")
      .select("enabled_default")
      .eq("key", "signups_open")
      .maybeSingle();
    if (signupsFlag && signupsFlag.enabled_default === false) {
      throw new MpError("AUTH.SIGNUPS_CLOSED", "Los registros están cerrados temporalmente. Vuelve a intentarlo más tarde.", 403);
    }

    const supabase = await getServerClient();
    const parsedName = parsePersonName(data.displayName);
    const normalizedUsername = data.username.trim().toLowerCase();

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          username: normalizedUsername,
          display_name: parsedName.displayName,
          locale: data.locale ?? "es",
        },
      },
    });

    if (error) {
      throw mapSupabaseAuthError(error, "signUp");
    }

    if (!signUpData.user) {
      throw new MpError(
        "AUTH.SIGNUP_PENDING",
        "Revisa tu correo para confirmar tu cuenta.",
        202,
      );
    }

    // Trigger tg_handle_new_auth_user already inserted profile + role 'user'.
    // Sincronizamos first/last para que el onboarding no repita el paso de identidad.
    const { error: profileSyncErr } = await supabase
      .from("profiles")
      .update({
        first_name: parsedName.firstName,
        last_name: parsedName.lastName || null,
        display_name: parsedName.displayName,
        username: normalizedUsername,
      } as never)
      .eq("id", signUpData.user.id);
    if (profileSyncErr) {
      console.error("[auth.signUp] profile identity sync failed", profileSyncErr);
    }

    // Default the active role cookie so the dashboard works on first load.
    const c = await cookies();
    c.set(ACTIVE_ROLE_COOKIE, "user", COOKIE_OPTS);
    c.delete(ACTIVE_CLUB_COOKIE);

    const { tryGrantMatchPointPlusOnSignup } = await import("@/server/plan/grant-matchpoint-plus");
    await tryGrantMatchPointPlusOnSignup(signUpData.user.id);

    // Welcome DM del perfil MATCHPOINT. Fire-and-forget; si falla NO rompe
    // el signup. El killswitch system_messages_enabled lo apaga global.
    try {
      const { sendSystemMessage, renderTemplate } = await import("@/lib/messages/system");
      const firstName = parsedName.firstName || "jugador";
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
      failClosed: true,
    });
    const supabase = await getServerClient();
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      throw mapSupabaseAuthError(error, "signIn");
    }

    // Bloqueo por suspensión: si el usuario tiene una suspensión activa
    // (mig 173), cerramos la sesión recién creada y rechazamos el login.
    // El check va aquí (post-auth) y no antes para evitar enumeración de
    // emails — un atacante no debería poder distinguir "suspendido" de
    // "no existe" sin la contraseña correcta.
    if (signInData.user?.id) {
      const { isUserSuspended, getSuspensionInfo } = await import(
        "@/lib/auth/suspension"
      );
      if (await isUserSuspended(supabase, signInData.user.id)) {
        const info = await getSuspensionInfo(supabase, signInData.user.id);
        await supabase.auth.signOut();
        throw new MpError(
          "ACCOUNT.SUSPENDED",
          info?.reason
            ? `Cuenta suspendida: ${info.reason}`
            : "Tu cuenta está suspendida. Contacta a soporte.",
          403,
        );
      }
    }

    const session = await buildSession();

    // Cookie de rol: prioridad staff > user (el orden del SELECT no es estable).
    const c = await cookies();
    if (!c.get(ACTIVE_ROLE_COOKIE)?.value && session.roles.length > 0) {
      const pick =
        ROLE_LOGIN_PRIORITY.map((r) => session.roles.find((a) => a.role === r)).find(Boolean) ??
        session.roles[0];
      c.set(ACTIVE_ROLE_COOKIE, pick.role, COOKIE_OPTS);
      if (pick.clubId) c.set(ACTIVE_CLUB_COOKIE, pick.clubId, COOKIE_OPTS);
      else c.delete(ACTIVE_CLUB_COOKIE);
    }

    return await buildSession();
  });
}

// ── requestPasswordReset ────────────────────────────────────────────────
//
// Anti-enumeración: SIEMPRE devuelve { ok: true } incluso si el email no
// está registrado o si Supabase devuelve error. El mensaje de éxito en la UI
// debe ser neutro ("Te enviamos un correo si esa cuenta existe."). Sólo
// propagamos errores de validación de input y de rate-limit (429).
export async function requestPasswordReset(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(RequestPasswordResetSchema, input, async (data) => {
    await assertRateLimit({
      key: `auth:reset:${await clientIp()}`,
      ...RATE_LIMITS.authSensitive,
      failClosed: true,
    });

    const supabase = await getServerClient();
    const origin = await requestOrigin();
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${origin}/auth/reset-password`,
    });
    // Loggeamos errores reales (cuota SMTP, config) pero no los exponemos —
    // confirmar "este email no existe" rompería LOPDP.
    if (error) {
      console.error("[auth.requestPasswordReset] supabase error", error.message);
    }
    return { ok: true as const };
  });
}

// ── updatePassword ──────────────────────────────────────────────────────
//
// Requiere sesión activa (la sesión recovery establecida por el link del
// email). El form vive en /auth/reset-password y se llama solo después de
// que el client SDK haya exchangeado el token recovery.
export async function updatePassword(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(UpdatePasswordSchema, input, async (data) => {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new MpError(
        "AUTH.RECOVERY_EXPIRED",
        "Tu enlace de recuperación expiró. Solicita uno nuevo.",
        401,
      );
    }
    const { error } = await supabase.auth.updateUser({ password: data.password });
    if (error) {
      throw mapSupabaseAuthError(error, "updatePassword");
    }
    return { ok: true as const };
  });
}

async function requestOrigin(): Promise<string> {
  // En producción, NEXT_PUBLIC_APP_URL es la fuente canónica y más confiable
  // que las request headers (que pueden venir del proxy interno con localhost).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && !appUrl.includes("localhost")) {
    return appUrl.replace(/\/$/, "");
  }
  const h = await headers();
  const explicitOrigin = h.get("origin");
  if (explicitOrigin && !explicitOrigin.includes("localhost")) return explicitOrigin;
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
  if (host && !host.includes("localhost")) return `${proto}://${host}`;
  // Fallback explícito al dominio de producción.
  if (process.env.NODE_ENV === "production") return "https://matchpoint.top";
  // En dev local usamos la origin real del header para poder testear OAuth.
  if (explicitOrigin) return explicitOrigin;
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
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

    const activeAssignments = assignments ?? [];
    const isAdmin = activeAssignments.some((a) => a.role === "admin");
    let candidates = activeAssignments.filter((a) => a.role === data.role);
    if (data.clubId) candidates = candidates.filter((a) => a.club_id === data.clubId);
    if (data.partnerId) candidates = candidates.filter((a) => a.partner_id === data.partnerId);
    const match = candidates[0];
    if (!match && !isAdmin) {
      throw new AuthError("AUTH.ROLE_REQUIRED", `Role '${data.role}' not granted to user`);
    }

    const c = await cookies();
    c.set(ACTIVE_ROLE_COOKIE, data.role, COOKIE_OPTS);
    const clubForCookie = data.clubId ?? match?.club_id ?? null;
    if (clubForCookie) c.set(ACTIVE_CLUB_COOKIE, clubForCookie, COOKIE_OPTS);
    else c.delete(ACTIVE_CLUB_COOKIE);

    // Purga el cache RSC de todo el dashboard: sin esto, un deep-link tras el
    // switch puede servir pantallas cacheadas del rol/club anterior. El switch
    // es un evento raro, así que la invalidación amplia es aceptable aquí
    // (NO copiar este patrón en mutaciones frecuentes).
    revalidatePath("/dashboard", "layout");

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
    locale: row.locale ?? "es",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

// ── Form helpers (used by /login and /signup pages) ─────────────────────
//
export async function signUpFromForm(prevState: unknown, formData: FormData) {
  const result = await signUp({
    email: formData.get("email"),
    password: formData.get("password"),
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    locale: formData.get("locale") ?? undefined,
    acceptTerms: formData.get("acceptTerms"),
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
    const activeRole = (result.data.activeRole ?? "user") as RoleKey;
    const next = (formData.get("next") as string) || `/dashboard/${activeRole}`;
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
  // Redirige al landing con flag que dispara el toast "Cerraste sesión".
  redirect("/?logout=ok");
}

// ── beginGoogleOAuth ────────────────────────────────────────────────────
//
// Inicia el flujo PKCE con Google. Redirige al consent screen; el retorno
// lo maneja /auth/callback. Requiere Google habilitado en Supabase Dashboard
// y redirect URLs allowlisted (Site URL + /auth/callback).
export async function beginGoogleOAuthFromForm(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ ok: true }> | null> {
  const intent = formData.get("intent") === "signup" ? "signup" : "signin";
  const next = safeOAuthNext((formData.get("next") as string | null) ?? null);

  await assertRateLimit({
    key: `auth:oauth:google:${await clientIp()}`,
    ...RATE_LIMITS.authSensitive,
    failClosed: true,
  });

  if (intent === "signup" && (await areSignupsClosed())) {
    return fail(
      "AUTH.SIGNUPS_CLOSED",
      "Los registros están cerrados temporalmente. Vuelve a intentarlo más tarde.",
    );
  }

  const supabase = await getServerClient();
  const origin = await requestOrigin();
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "online",
        prompt: "select_account",
      },
    },
  });

  if (error || !data.url) {
    console.error("[auth.beginGoogleOAuth] supabase error", error?.message);
    return fail(
      "AUTH.OAUTH_START_FAILED",
      "No pudimos conectar con Google. Inténtalo de nuevo en un momento.",
    );
  }

  redirect(data.url);
}

export async function requestPasswordResetFromForm(
  prevState: unknown,
  formData: FormData,
) {
  return requestPasswordReset({ email: formData.get("email") });
}

export async function updatePasswordFromForm(
  prevState: unknown,
  formData: FormData,
) {
  const password = formData.get("password");
  const confirm = formData.get("confirm");
  if (typeof password === "string" && typeof confirm === "string" && password !== confirm) {
    return fail("VALIDATION.PASSWORD_MISMATCH", "Las contraseñas no coinciden.", {
      fields: { confirm: ["No coincide con la nueva contraseña."] },
    });
  }
  const result = await updatePassword({ password });
  if (result.ok) {
    redirect("/dashboard/user?reset=ok");
  }
  return result;
}
