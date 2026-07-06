// Resuelve el clubId activo del session user. Patrón compartido por todas las
// pantallas del dashboard owner/manager/employee/admin.
//
// Orden de resolución:
// 1. session.activeClubId (cookie, set por RoleSwitcher / club picker) si
//    sigue siendo un club donde el user es staff
// 2. role_assignments de staff con club_id no null; si el rol activo de la
//    sesión es uno de los staffRoles, se prefieren los clubes de ESE rol
//    (evita que un owner+employee multi-club caiga a un club arbitrario
//    cuando la cookie de club está stale); dentro del grupo gana el
//    granted_at más reciente
// 3. Si el user es admin global: fallback al primer club activo del sistema
//    (admin opera sobre cualquier club por default cuando no hay activeClubId)
// 4. null
import "server-only";
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";

type Opts = {
  // Roles que aplican para "soy staff de este club".
  staffRoles?: readonly string[];
};

const DEFAULT_STAFF: readonly string[] = ["owner", "manager", "employee", "admin"];

export async function resolveActiveClubId(opts: Opts = {}): Promise<string | null> {
  const session = await getSession();
  if (!session.authenticated) return null;

  const staffRoles = opts.staffRoles ?? DEFAULT_STAFF;
  const supabase = await getServerClient();
  const activeClubId = session.session.activeClubId ?? null;

  // Todos los role_assignments de staff vigentes con club_id (sin limit,
  // para poder chequear si la cookie sigue siendo uno de ellos).
  const { data: staffRows } = await supabase
    .from("role_assignments")
    .select("club_id,role")
    .eq("user_id", session.session.userId)
    .in("role", staffRoles as ("owner" | "manager" | "employee" | "admin" | "partner" | "user" | "coach")[])
    .not("club_id", "is", null)
    .is("revoked_at", null)
    .order("granted_at", { ascending: false });

  if (activeClubId && (staffRows ?? []).some((r) => r.club_id === activeClubId)) {
    return activeClubId;
  }
  const activeRole = session.session.activeRole ?? null;
  const sameRoleRow =
    activeRole && staffRoles.includes(activeRole)
      ? (staffRows ?? []).find((r) => r.role === activeRole)
      : undefined;
  if (sameRoleRow?.club_id) return sameRoleRow.club_id as string;
  if (staffRows?.[0]?.club_id) return staffRows[0].club_id as string;

  // Admin global → la cookie vale sobre cualquier club activo; si no hay
  // cookie (o ya no es un club activo), fallback al primer club activo.
  const { data: adminRows } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", session.session.userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .limit(1);
  if (adminRows && adminRows.length > 0) {
    if (activeClubId) {
      const { data: activeClub } = await supabase
        .from("clubs")
        .select("id")
        .eq("id", activeClubId)
        .eq("status", "active")
        .maybeSingle();
      if (activeClub?.id) return activeClub.id as string;
    }
    const { data: firstClub } = await supabase
      .from("clubs")
      .select("id")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);
    if (firstClub?.[0]?.id) return firstClub[0].id as string;
  }

  return null;
}
