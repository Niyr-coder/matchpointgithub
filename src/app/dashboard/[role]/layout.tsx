import { notFound, redirect } from "next/navigation";

import { MP_ROLES, type RoleKey } from "@/lib/roles";

import { DashboardChrome } from "@/components/dashboard/DashboardChrome";

import { RoleSwitcher } from "@/components/dashboard/RoleSwitcher";

import { getSession } from "@/lib/auth/session";

import { getServerClient } from "@/lib/db/client.server";

import { decideDashboardRoleAccess } from "@/lib/auth/role-route-guard";

import { evaluateStaffMfaGate, buildMfaRedirectPath } from "@/lib/auth/mfa";

import { ACTIVE_ROLE_COOKIE } from "@/lib/auth/session";

import { cookies } from "next/headers";

import {

  buildRoleSwitchOptions,

  loadDashboardChromeProps,

} from "@/server/queries/dashboard-chrome";

import {

  dashboardHomePath,

  resolveDashboardHomeRole,

} from "@/lib/dashboard/resolve-off-segment-role";



function isValidRole(r: string): r is RoleKey {

  return Object.prototype.hasOwnProperty.call(MP_ROLES, r);

}



export default async function RoleLayout({

  children,

  params,

}: {

  children: React.ReactNode;

  params: Promise<{ role: string }>;

}) {

  const { role } = await params;

  if (!isValidRole(role)) notFound();



  const session = await getSession();

  if (!session.authenticated) redirect(`/?auth=signin&next=/dashboard/${role}`);



  const supabase = await getServerClient();

  const { data: roles } = await supabase

    .from("role_assignments")

    .select("role,club_id,partner_id")

    .eq("user_id", session.session.userId)

    .is("revoked_at", null);



  const granted = new Set((roles ?? []).map((r) => r.role as RoleKey));

  const isAdmin = granted.has("admin");

  const cookieRole = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value;



  const access = decideDashboardRoleAccess({

    urlRole: role,

    cookieRole,

    granted,

    isAdmin,

  });

  if (access.action === "redirect") {

    redirect(`/dashboard/${access.toRole}`);

  }



  const mfaGate = await evaluateStaffMfaGate({

    urlRole: role,

    supabase,

    nextPath: `/dashboard/${role}`,

  });

  if (mfaGate.action === "redirect") {

    redirect(buildMfaRedirectPath(mfaGate.mode, mfaGate.next));

  }



  const roleSwitchOptions = buildRoleSwitchOptions(roles ?? [], isAdmin);

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

