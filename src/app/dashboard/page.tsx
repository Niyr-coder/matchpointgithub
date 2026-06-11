import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ROLE_COOKIE } from "@/lib/auth/session";
import { resolveDashboardHomeRole } from "@/lib/auth/role-route-guard";
import { getServerClient } from "@/lib/db/client.server";
import type { RoleKey } from "@/lib/roles";

export default async function DashboardIndex() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/?auth=signin&next=/dashboard");
  }

  const { data: assignments } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  const granted = new Set((assignments ?? []).map((r) => r.role as RoleKey));
  const cookieStore = await cookies();
  const role = resolveDashboardHomeRole(cookieStore.get(ACTIVE_ROLE_COOKIE)?.value, granted);

  redirect(`/dashboard/${role}`);
}
