// Layout para /dashboard/eventos/* — replica el chrome del dashboard,
// idéntico al de /dashboard/clubes/*, para rutas que viven fuera de [role].
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { RoleSwitcher } from "@/components/dashboard/RoleSwitcher";
import { getSession, ACTIVE_ROLE_COOKIE } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { getServerClient } from "@/lib/db/client.server";

function isValidRole(r: string): r is RoleKey {
  return Object.prototype.hasOwnProperty.call(MP_ROLES, r);
}

export default async function DashboardEventosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.authenticated) redirect("/login?next=/dashboard/user");

  const supabase = await getServerClient();
  const { data: roleRows } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", session.session.userId)
    .is("revoked_at", null);
  const granted = new Set((roleRows ?? []).map((r) => r.role as RoleKey));
  const isAdmin = granted.has("admin");

  const cookieRole = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value;
  // Cuando no hay cookie o no es válida, preferimos roles privilegiados sobre
  // 'user'. Razón: si un partner/owner navega directo a /dashboard/eventos/...
  // sin pasar por su panel (que setea la cookie), no queremos degradar el
  // sidebar al chrome de jugador. Si realmente quiere verlo como user, debe
  // cambiar el rol activo desde el switcher (que sí escribe la cookie).
  const fallbackPriority: RoleKey[] = ["admin", "owner", "partner", "manager", "coach", "employee", "user"];
  const role: RoleKey =
    cookieRole && isValidRole(cookieRole) && (granted.has(cookieRole) || isAdmin)
      ? cookieRole
      : fallbackPriority.find((r) => granted.has(r)) ?? "user";

  const profile = await getProfileSummary(session.session.userId);
  const userName = profile.displayName ?? profile.username ?? "Usuario";
  const contextLabel: string | null =
    role === "admin" ? "Plataforma · MATCHPOINT EC" : role === "user" ? null : null;

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--fg)",
      }}
    >
      <DashboardSidebar role={role} userName={userName} contextLabel={contextLabel} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar role={role} contextLabel={contextLabel} />
        <main
          style={{
            padding: 28,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            flex: 1,
          }}
        >
          {children}
        </main>
      </div>
      {isAdmin && <RoleSwitcher current={role} />}
    </div>
  );
}
