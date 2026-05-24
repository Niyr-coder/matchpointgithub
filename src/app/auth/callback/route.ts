// OAuth callback handler (Supabase SSR).
//
// Flujo PKCE:
//   1. Proveedor (Google/Apple/etc) redirige acá con ?code=...&next=...
//   2. Intercambiamos el code por una sesión usando el cookie-based client.
//   3. Si OK → redirect al `next` (default /dashboard/user; el layout del
//      dashboard ya se encarga del gate hacia /onboarding cuando profile.
//      onboarded_at IS NULL).
//   4. Si falla o falta el code → /login?error=oauth_failed.
//
// Validamos que `next` sea una ruta local para evitar open redirect: si el
// caller manda algo como `next=https://evil.com`, lo descartamos y caemos al
// default.
import { NextResponse, type NextRequest } from "next/server";
import { getRouteClient } from "@/lib/db/client.route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_NEXT = "/dashboard/user";

function safeNext(raw: string | null): string {
  if (!raw) return DEFAULT_NEXT;
  // Solo aceptamos rutas internas absolutas (/algo). Evita //evil.com,
  // protocolos (http:, javascript:), y paths relativos ambiguos.
  if (!raw.startsWith("/") || raw.startsWith("//")) return DEFAULT_NEXT;
  return raw;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await getRouteClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, req.url));
  }

  return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
}
