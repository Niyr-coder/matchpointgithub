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
  const activeRole = (cookieStore.get(ACTIVE_ROLE_COOKIE)?.value as MpRole | undefined) ?? null;
  const activeClubId = cookieStore.get(ACTIVE_CLUB_COOKIE)?.value ?? null;

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

export async function requireRole(role: RoleKey): Promise<SessionShape> {
  const s = await requireSession();
  if (s.activeRole !== role) {
    throw new AuthError("AUTH.ROLE_REQUIRED", `Role '${role}' required, active is '${s.activeRole}'`);
  }
  return s;
}

export async function requireClubScope(clubId: string): Promise<SessionShape> {
  const s = await requireSession();
  if (s.activeClubId !== clubId) {
    throw new AuthError("AUTH.SCOPE_REQUIRED", `Active club mismatch`);
  }
  return s;
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
