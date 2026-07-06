import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { evaluateStaffMfaGate, buildMfaRedirectPath } from "@/lib/auth/mfa";
import { DashboardChromeServer } from "@/components/dashboard/DashboardChromeServer";

// Este layout cubre el subtree estático /dashboard/partner/torneo/[id]
// (las secciones /dashboard/partner/p-* resuelven por [role]/[section] con
// su guard completo). La authz de la página de torneo es más amplia que
// "tiene rol partner": admite admin, miembros del partner y staff del club
// anfitrión — por eso aquí NO se aplica decideDashboardRoleAccess. Lo que sí
// aplica a todos sus visitantes (roles staff) es el gate de MFA, que antes
// este layout bypasseaba.
export default async function DashboardPartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.authenticated) redirect("/?auth=signin&next=/dashboard/partner");

  const supabase = await getServerClient();
  const mfaGate = await evaluateStaffMfaGate({
    urlRole: "partner",
    supabase,
    nextPath: "/dashboard/partner",
  });
  if (mfaGate.action === "redirect") {
    redirect(buildMfaRedirectPath(mfaGate.mode, mfaGate.next));
  }

  return <DashboardChromeServer segment="partner">{children}</DashboardChromeServer>;
}
