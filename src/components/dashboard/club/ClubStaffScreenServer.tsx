// Server wrapper de Personal del club (demo ClubStaffView) que resuelve el club
// activo y si el usuario puede asignar staff (owner del club o admin), para
// habilitar la asignación REAL (AssignStaffModal → assignRole con términos).
// El resto del Personal sigue demo.
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { ClubStaffView } from "./ClubStaffView";

export async function ClubStaffScreenServer() {
  const { session } = await getSession();
  let clubId = session?.activeClubId ?? null;
  let canAssign = false;
  if (session?.userId) {
    const supabase = await getServerClient();
    const { data: ras } = await supabase
      .from("role_assignments")
      .select("role,club_id")
      .eq("user_id", session.userId)
      .is("revoked_at", null);
    const rows = ras ?? [];
    if (!clubId) {
      clubId = (rows.find((r) => (r.role === "owner" || r.role === "manager") && r.club_id)?.club_id as string | undefined) ?? null;
    }
    const isAdmin = rows.some((r) => r.role === "admin");
    canAssign = isAdmin || rows.some((r) => r.role === "owner" && r.club_id === clubId);
  }
  return <ClubStaffView clubId={clubId} canAssign={canAssign} />;
}
