// Helper canónico de "staff del club" para server actions.
//
// Antes cada action mantenía su propia copia inline del check contra
// role_assignments, y los criterios divergieron (courts excluía a employee,
// reservations/walkins lo incluían). Este módulo es la única fuente de
// verdad; los presets hacen explícito qué roles operan cada dominio:
//
//   FRONT_DESK_ROLES      → reservas, walk-ins, check-in, caja, proshop
//   CLUB_MANAGEMENT_ROLES → canchas, configuración, marketing, staff
//
// `admin` de plataforma siempre pasa (bypass), igual que en las policies RLS
// (mp_club_staff / mp_is_employee_of). Ver docs/guides/00-roles.md.
import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { AuthError } from "@/lib/auth/session";

export const FRONT_DESK_ROLES = ["owner", "manager", "employee"] as const;
export const CLUB_MANAGEMENT_ROLES = ["owner", "manager"] as const;

export type ClubStaffRole = (typeof FRONT_DESK_ROLES)[number];

/**
 * ¿El usuario autenticado tiene uno de estos roles vigentes en el club
 * (o es admin de plataforma)? Retorna false si no hay sesión.
 */
export async function isClubStaff(
  clubId: string,
  roles: readonly ClubStaffRole[],
): Promise<boolean> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: assignments } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  return (assignments ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId && (roles as readonly string[]).includes(r.role as string)),
  );
}

/**
 * Igual que isClubStaff pero lanza AuthError si no cumple.
 * Retorna el userId autenticado para que el caller no repita getUser().
 */
export async function assertClubStaff(
  clubId: string,
  roles: readonly ClubStaffRole[],
): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data: assignments } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  const ok = (assignments ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId && (roles as readonly string[]).includes(r.role as string)),
  );
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff role required");
  return user.id;
}
