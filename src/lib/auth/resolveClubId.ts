// Resuelve el clubId activo del session user. Patrón compartido por todas las
// pantallas del dashboard owner/manager/employee/admin.
//
// Orden de resolución:
// 1. session.activeClubId (cookie, set por RoleSwitcher / club picker)
// 2. role_assignments con role staff (owner/manager/employee) y club_id no null
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
  if (session.session.activeClubId) return session.session.activeClubId;

  const staffRoles = opts.staffRoles ?? DEFAULT_STAFF;
  const supabase = await getServerClient();

  // Primer role_assignment de staff con club_id.
  const { data: staffRows } = await supabase
    .from("role_assignments")
    .select("club_id,role")
    .eq("user_id", session.session.userId)
    .in("role", staffRoles as ("owner" | "manager" | "employee" | "admin" | "partner" | "user" | "coach")[])
    .not("club_id", "is", null)
    .is("revoked_at", null)
    .order("granted_at", { ascending: false })
    .limit(1);
  if (staffRows?.[0]?.club_id) return staffRows[0].club_id as string;

  // Admin global → primer club activo.
  const { data: adminRows } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", session.session.userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .limit(1);
  if (adminRows && adminRows.length > 0) {
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
