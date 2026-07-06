// Next 16 Proxy (formerly known as middleware).
// Responsibilities:
//   1. Refresh Supabase auth cookies before they expire (critical for SSR session).
//   2. Gate /dashboard/* behind an authenticated session (cheap optimistic check).
//
// El rol/club activo viaja SOLO por cookies (mp_active_role / mp_active_club);
// los Server Components lo leen vía getSession()/resolveActiveClubId.
// Heavy authorization (RLS, role.club_id membership) happens server-side per request.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "@/lib/db/env";
import { ACTIVE_CLUB_COOKIE, ACTIVE_ROLE_COOKIE } from "@/lib/auth/session";
import {
  decideDashboardRoleAccess,
  isDashboardRoleKey,
  resolveDashboardHomeRole,
} from "@/lib/auth/role-route-guard";
import type { RoleKey } from "@/lib/roles";
const ACTIVE_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export async function proxy(request: NextRequest) {
  // tv.matchpoint.top — pantalla de venue
  const host = request.headers.get("host") ?? "";
  if (/^tv\./.test(host)) {
    const slug = request.nextUrl.pathname.replace(/^\//, "").split("/")[0];
    const rewriteUrl = request.nextUrl.clone();
    // Sin slug → empty state de tv
    rewriteUrl.pathname = slug ? `/t/${slug}/live` : "/tv";
    return NextResponse.rewrite(rewriteUrl);
  }

  const { pathname } = request.nextUrl;
  const isProtected = pathname.startsWith("/dashboard");
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));

  // Fast path: rutas publicas sin cookie de Supabase no necesitan validar
  // ni refrescar sesion. Esto evita un round-trip a auth.getUser() (~150ms
  // por hit) en toda la landing para visitantes anonimos.
  if (!isProtected && !isAuthRoute && !hasSupabaseCookie) {
    return NextResponse.next({ request });
  }

  // Start from the incoming request so cookies refreshed by Supabase get
  // attached to the response we eventually return.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror new cookies onto both the request (so downstream handlers see them)
        // and the response (so the browser stores the refreshed values).
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh auth token if needed. We deliberately ignore the result here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Auth gate ──────────────────────────────────────────────────────────
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if ((isAuthRoute || pathname === "/") && user) {
    const { data: assignments } = await supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", user.id)
      .is("revoked_at", null);
    const granted = new Set((assignments ?? []).map((r) => r.role as RoleKey));
    const pick = resolveDashboardHomeRole(
      request.cookies.get(ACTIVE_ROLE_COOKIE)?.value,
      granted,
    );
    const url = request.nextUrl.clone();
    url.pathname = `/dashboard/${pick}`;
    return NextResponse.redirect(url);
  }

  // ── Suspension gate ────────────────────────────────────────────────────
  // Si el usuario tiene una suspensión activa (mig 173), cerramos su sesión
  // y lo botamos a /login?suspended=1. Solo corremos esta query en rutas
  // protegidas para no agregar latencia a la landing. El index único parcial
  // sobre user_suspensions(user_id) where reactivated_at is null hace el
  // lookup O(log n).
  if (isProtected && user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: suspension } = await (supabase as any)
      .from("user_suspensions")
      .select("id")
      .eq("user_id", user.id)
      .is("reactivated_at", null)
      .limit(1)
      .maybeSingle();
    if (suspension) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("suspended", "1");
      return NextResponse.redirect(url);
    }
  }

  // Guard de rol: la URL no puede "saltar" a otro dashboard si la cookie activa
  // ya fijó un rol (salvo admin view-as). Cambio de rol → switchRole.
  const roleFromUrl = pathname.match(/^\/dashboard\/([^/]+)/)?.[1];
  if (isProtected && user && roleFromUrl && isDashboardRoleKey(roleFromUrl)) {
    const { data: assignments } = await supabase
      .from("role_assignments")
      .select("role,club_id,partner_id")
      .eq("user_id", user.id)
      .is("revoked_at", null);
    const granted = new Set((assignments ?? []).map((r) => r.role as RoleKey));
    const isAdmin = granted.has("admin");
    const decision = decideDashboardRoleAccess({
      urlRole: roleFromUrl,
      cookieRole: request.cookies.get(ACTIVE_ROLE_COOKIE)?.value,
      granted,
      isAdmin,
    });

    if (decision.action === "redirect") {
      const url = request.nextUrl.clone();
      url.pathname = `/dashboard/${decision.toRole}`;
      return NextResponse.redirect(url);
    }

    if (decision.syncCookieTo) {
      response.cookies.set(ACTIVE_ROLE_COOKIE, decision.syncCookieTo, ACTIVE_COOKIE_OPTS);
      const scoped = ["owner", "manager", "employee", "coach", "partner"] as const;
      if ((scoped as readonly string[]).includes(decision.syncCookieTo)) {
        const row = (assignments ?? []).find((a) => a.role === decision.syncCookieTo);
        if (row?.club_id) {
          response.cookies.set(ACTIVE_CLUB_COOKIE, row.club_id as string, ACTIVE_COOKIE_OPTS);
        } else {
          response.cookies.delete(ACTIVE_CLUB_COOKIE);
        }
      } else {
        response.cookies.delete(ACTIVE_CLUB_COOKIE);
      }
    }
  }

  return response;
}

export const config = {
  // Skip static assets and OpenAPI spec; run everywhere else.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|openapi.json|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)"],
};
