import { getServerClient } from "@/lib/db/client.server";
import { requireUserId } from "@/lib/auth/session";

/** ¿Puede gestionar esta quedada (creador, co-host o admin plataforma)? */
export async function canManageQuedada(quedadaId: string, userId?: string): Promise<boolean> {
  const uid = userId ?? (await requireUserId());
  const supabase = await getServerClient();

  const { data: permissionRow, error: permissionErr } = await supabase
    .from("quedadas")
    .select("id,creator_id")
    .eq("id", quedadaId)
    .maybeSingle();
  if (permissionErr || !permissionRow) return false;

  if ((permissionRow.creator_id as string) === uid) return true;

  const [{ data: cohostRows }, { data: adminRoleRows }] = await Promise.all([
    supabase.from("quedada_cohosts").select("user_id").eq("quedada_id", quedadaId),
    supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .is("revoked_at", null)
      .limit(1),
  ]);

  if ((adminRoleRows ?? []).length > 0) return true;
  return ((cohostRows ?? []) as Array<{ user_id: string }>).some((c) => c.user_id === uid);
}
