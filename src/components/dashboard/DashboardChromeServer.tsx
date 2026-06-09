// Shell server del dashboard: unifica sidebar + topbar + bottom nav mobile
// para rutas fuera de /dashboard/[role]/* (clubes, eventos, partner, …).
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { RoleKey } from "@/lib/roles";
import {
  resolveOffSegmentDashboardRole,
  resolvePartnerSegmentRole,
  resolveDashboardHomeRole,
  dashboardHomePath,
} from "@/lib/dashboard/resolve-off-segment-role";
import { ACTIVE_ROLE_COOKIE, getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import {
  buildRoleSwitchOptions,
  loadDashboardChromeProps,
} from "@/server/queries/dashboard-chrome";
import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { RoleSwitcher } from "@/components/dashboard/RoleSwitcher";

type Props = {
  children: React.ReactNode;
  /** Fuerza lógica de rol partner (rutas /dashboard/partner/*). */
  segment?: "default" | "partner";
};

export async function DashboardChromeServer({ children, segment = "default" }: Props) {
  const session = await getSession();
  if (!session.authenticated) redirect("/login?next=/dashboard/user");

  const supabase = await getServerClient();
  const { data: roleRows } = await supabase
    .from("role_assignments")
    .select("role,club_id,partner_id")
    .eq("user_id", session.session.userId)
    .is("revoked_at", null);

  const granted = new Set((roleRows ?? []).map((r) => r.role as RoleKey));
  const isAdmin = granted.has("admin");
  const cookieRole = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value;

  let role: RoleKey;
  if (segment === "partner") {
    role = resolvePartnerSegmentRole({
      sessionActiveRole: session.session.activeRole as RoleKey | null,
      isAdmin,
      hasPartner: granted.has("partner"),
    });
  } else {
    role = resolveOffSegmentDashboardRole({ cookieRole, granted, isAdmin });
  }

  const roleSwitchOptions = buildRoleSwitchOptions(roleRows ?? [], isAdmin);
  const homeRole = resolveDashboardHomeRole({ cookieRole, granted, isAdmin, fallback: role });
  const chrome = await loadDashboardChromeProps({
    role,
    userId: session.session.userId,
    supabase,
    homeHref: dashboardHomePath(homeRole),
    roleSwitchOptions: !isAdmin ? roleSwitchOptions : undefined,
  });

  return (
    <>
      <DashboardChrome {...chrome}>{children}</DashboardChrome>
      {isAdmin && <RoleSwitcher current={role} />}
    </>
  );
}
