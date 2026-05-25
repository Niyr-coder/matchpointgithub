// Next 16 Proxy (formerly known as middleware).
// Responsibilities:
//   1. Refresh Supabase auth cookies before they expire (critical for SSR session).
//   2. Inject x-active-role / x-active-club headers downstream so Server
//      Components and Route Handlers can read them without re-parsing cookies.
//   3. Gate /dashboard/* behind an authenticated session (cheap optimistic check).
//
// Heavy authorization (RLS, role.club_id membership) happens server-side per request.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "@/lib/db/env";
import { ACTIVE_CLUB_COOKIE, ACTIVE_ROLE_COOKIE } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
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
    const response = NextResponse.next({ request });
    const activeRole = request.cookies.get(ACTIVE_ROLE_COOKIE)?.value;
    const activeClub = request.cookies.get(ACTIVE_CLUB_COOKIE)?.value;
    if (activeRole) response.headers.set("x-active-role", activeRole);
    if (activeClub) response.headers.set("x-active-club", activeClub);
    return response;
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
        for (const { name, value, options } of cookiesToSet) {
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

  // ── Active role / club passthrough ─────────────────────────────────────
  const activeRole = request.cookies.get(ACTIVE_ROLE_COOKIE)?.value ?? "";
  const activeClub = request.cookies.get(ACTIVE_CLUB_COOKIE)?.value ?? "";
  if (activeRole) response.headers.set("x-active-role", activeRole);
  if (activeClub) response.headers.set("x-active-club", activeClub);

  // ── Auth gate ──────────────────────────────────────────────────────────
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/user";
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

  return response;
}

export const config = {
  // Skip static assets and OpenAPI spec; run everywhere else.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|openapi.json|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)"],
};
