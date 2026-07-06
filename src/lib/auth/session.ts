// Session + active role helpers. Used by Server Actions, Route Handlers and
// Server Components to read who is doing what.
import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { getServerClient } from "@/lib/db/client.server";
import type { RoleKey } from "@/lib/roles";

// Local alias for clarity; same as RoleKey.
export type MpRole = RoleKey;

export const ACTIVE_ROLE_COOKIE = "mp_active_role";
export const ACTIVE_CLUB_COOKIE = "mp_active_club";

export type SessionShape = {
  userId: string;
  email: string | null;
  // Role assignments from JWT app_metadata once we wire it; for now derived
  // from cookie only. Will be hydrated from role_assignments table in Fase 2.
  activeRole: MpRole | null;
  activeClubId: string | null;
};

export type SessionResult =
  | { authenticated: true; session: SessionShape }
  | { authenticated: false; session: null };

type ClaimsPayload = {
  sub?: string;
  email?: string | null;
};

type ClaimsAuthResult =
  | { authenticated: true; userId: string; email: string | null; claims: ClaimsPayload }
  | { authenticated: false; userId: null; email: null; claims: null };

type AuthClientWithClaims = {
  getClaims: () => Promise<{
    data: { claims?: ClaimsPayload | null } | null;
    error: { message?: string } | null;
  }>;
};

// Camino rápido para actions que solo necesitan auth.uid(). getClaims()
// valida el JWT y evita un roundtrip a Auth cuando el proyecto usa llaves
// asimétricas. Si no está disponible o falla, caemos a getUser(), que sigue
// siendo la validación canónica de Supabase SSR.
export const getClaimsAuth = cache(async (): Promise<ClaimsAuthResult> => {
  const supabase = await getServerClient();
  const authWithClaims = supabase.auth as unknown as Partial<AuthClientWithClaims>;

  if (typeof authWithClaims.getClaims === "function") {
    try {
      const { data, error } = await authWithClaims.getClaims();
      const claims = data?.claims ?? null;
      if (!error && typeof claims?.sub === "string" && claims.sub.length > 0) {
        return {
          authenticated: true,
          userId: claims.sub,
          email: claims.email ?? null,
          claims,
        };
      }
    } catch {
      // Fallback abajo: no bloqueamos la request por un path rápido fallido.
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { authenticated: false, userId: null, email: null, claims: null };

  return {
    authenticated: true,
    userId: user.id,
    email: user.email ?? null,
    claims: { sub: user.id, email: user.email ?? null },
  };
});

// React.cache memoiza el resultado por request. Múltiples server components
// del dashboard (layout, [role]/layout, UserHome, RankingScreen, EventosScreen)
// invocan getSession en el mismo render; sin cache cada llamada cuesta un
// roundtrip a supabase.auth.getUser(). El cache se invalida automáticamente
// entre requests.
export const getSession = cache(async (): Promise<SessionResult> => {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { authenticated: false, session: null };

  const cookieStore = await cookies();
  let activeRole = (cookieStore.get(ACTIVE_ROLE_COOKIE)?.value as MpRole | undefined) ?? null;
  let activeClubId = cookieStore.get(ACTIVE_CLUB_COOKIE)?.value ?? null;

  // Defensa en profundidad: las cookies de rol/club no van firmadas, así que un
  // atacante con acceso al dispositivo podría setearlas a mano. Validamos que
  // el rol activo corresponda a un role_assignment vigente del usuario (RLS
  // ra_self_select deja leer los propios). Si no coincide (cookie stale o
  // manipulada) lo descartamos para que el resto del request caiga al estado
  // sin rol. Fail-open ante error de DB: nunca dejamos al usuario fuera del
  // dashboard por un hipo de red — el acceso a datos sigue protegido por RLS.
  if (activeRole) {
    const { data: assignments, error } = await supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", user.id)
      .is("revoked_at", null);
    if (!error && assignments) {
      const hasAdminRole = assignments.some((a) => a.role === "admin");
      const hasRole = assignments.some((a) => a.role === activeRole);
      if (!hasRole) {
        if (!hasAdminRole) {
          activeRole = null;
          activeClubId = null;
        }
      }
    }
  }

  return {
    authenticated: true,
    session: {
      userId: user.id,
      email: user.email ?? null,
      activeRole,
      activeClubId,
    },
  };
});

export async function requireSession(): Promise<SessionShape> {
  const r = await getSession();
  if (!r.authenticated) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return r.session;
}

export async function requireUserId(): Promise<string> {
  const r = await getClaimsAuth();
  if (!r.authenticated) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return r.userId;
}

/** true si el usuario tiene un role_assignment admin vigente. */
export async function userHasAdminRole(userId?: string): Promise<boolean> {
  let uid = userId;
  if (!uid) {
    const auth = await getClaimsAuth();
    if (!auth.authenticated) return false;
    uid = auth.userId;
  }

  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("user_id", uid)
    .eq("role", "admin")
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

/** Exige rol admin global. Usa limit(1) — tolera histórico sin dedupe. */
export async function requireAdminUserId(): Promise<string> {
  const userId = await requireUserId();
  if (!(await userHasAdminRole(userId))) {
    throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere rol admin");
  }
  return userId;
}

export class AuthError extends Error {
  constructor(
    public code: "AUTH.UNAUTHENTICATED" | "AUTH.ROLE_REQUIRED" | "AUTH.SCOPE_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
