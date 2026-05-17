// Resuelve el partnerId activo del session user. Lee de partner_members la
// primera org con role owner/admin del usuario. Si no hay, devuelve null.
//
// Patrón paralelo a resolveActiveClubId.ts.
import "server-only";
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";

export async function resolveActivePartnerId(): Promise<string | null> {
  const session = await getSession();
  if (!session.authenticated) return null;

  const supabase = await getServerClient();

  const { data: memberRows } = await supabase
    .from("partner_members")
    .select("partner_id,role,joined_at")
    .eq("user_id", session.session.userId)
    .in("role", ["owner", "admin"])
    .order("joined_at", { ascending: true })
    .limit(1);

  if (memberRows?.[0]?.partner_id) return memberRows[0].partner_id as string;

  // Admin global fallback: primer partner activo del sistema.
  const { data: adminRows } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", session.session.userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .limit(1);
  if (adminRows && adminRows.length > 0) {
    const { data: firstPartner } = await supabase
      .from("partner_orgs")
      .select("id")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);
    if (firstPartner?.[0]?.id) return firstPartner[0].id as string;
  }

  return null;
}
