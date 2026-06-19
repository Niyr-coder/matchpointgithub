// OAuth callback handler (Supabase SSR).
//
// Flujo PKCE:
//   1. Proveedor (Google/etc) redirige acá con ?code=...&next=...
//   2. Intercambiamos el code por una sesión usando el cookie-based client.
//   3. Post-auth: signups_open, suspensión, cookie de rol, onboarding.
//   4. Si OK → redirect al destino final.
//   5. Si falla → landing con ?auth=signin&error=...
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getRouteClient } from "@/lib/db/client.route";
import { ACTIVE_CLUB_COOKIE, ACTIVE_ROLE_COOKIE } from "@/lib/auth/session";
import { ROLE_LOGIN_PRIORITY } from "@/lib/auth/role-route-guard";
import {
  areSignupsClosed,
  buildPostAuthRedirect,
  isRecentlyCreatedUser,
  safeOAuthNext,
} from "@/lib/auth/oauth";
import type { RoleKey } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_NEXT = "/dashboard/user";

const ACTIVE_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

function oauthErrorRedirect(req: NextRequest, error: string): NextResponse {
  const url = new URL("/", req.url);
  url.searchParams.set("auth", "signin");
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

async function sendWelcomeIfNew(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const meta = user.user_metadata ?? {};
  const rawName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    user.email?.split("@")[0] ||
    "jugador";
  const firstName = rawName.split(" ")[0] || "jugador";

  try {
    const { sendSystemMessage, renderTemplate } = await import("@/lib/messages/system");
    await sendSystemMessage({
      recipientUserId: user.id,
      kind: "welcome_signup",
      body: renderTemplate("welcome_signup", { firstName }),
    });
  } catch (e) {
    console.error("[auth.callback] welcome message failed", e);
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeOAuthNext(req.nextUrl.searchParams.get("next"), DEFAULT_NEXT);

  if (!code) {
    return oauthErrorRedirect(req, "oauth_failed");
  }

  const supabase = await getRouteClient();
  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !sessionData.user) {
    console.error("[auth.callback] exchange failed", error?.message);
    return oauthErrorRedirect(req, "oauth_failed");
  }

  const user = sessionData.user;

  if (isRecentlyCreatedUser(user) && (await areSignupsClosed())) {
    await supabase.auth.signOut();
    return oauthErrorRedirect(req, "signups_closed");
  }

  const { isUserSuspended, getSuspensionInfo } = await import("@/lib/auth/suspension");
  if (await isUserSuspended(supabase, user.id)) {
    const info = await getSuspensionInfo(supabase, user.id);
    console.warn("[auth.callback] suspended user blocked", user.id, info?.reason);
    await supabase.auth.signOut();
    return oauthErrorRedirect(req, "account_suspended");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  const needsOnboarding = profile != null && profile.onboarded_at == null;
  const isNewUser = isRecentlyCreatedUser(user);

  const cookieStore = await cookies();
  if (!cookieStore.get(ACTIVE_ROLE_COOKIE)?.value) {
    const { data: roles } = await supabase
      .from("role_assignments")
      .select("role, club_id")
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (roles && roles.length > 0) {
      const pick =
        ROLE_LOGIN_PRIORITY.map((r) => roles.find((a) => a.role === r)).find(Boolean) ??
        roles[0];
      cookieStore.set(ACTIVE_ROLE_COOKIE, pick.role as RoleKey, ACTIVE_COOKIE_OPTS);
      if (pick.club_id) {
        cookieStore.set(ACTIVE_CLUB_COOKIE, pick.club_id, ACTIVE_COOKIE_OPTS);
      } else {
        cookieStore.delete(ACTIVE_CLUB_COOKIE);
      }
    } else {
      cookieStore.set(ACTIVE_ROLE_COOKIE, "user", ACTIVE_COOKIE_OPTS);
      cookieStore.delete(ACTIVE_CLUB_COOKIE);
    }
  }

  if (isNewUser) {
    await sendWelcomeIfNew(user);
  }

  const destination = buildPostAuthRedirect(next || DEFAULT_NEXT, needsOnboarding);

  return NextResponse.redirect(new URL(destination, req.url));
}
