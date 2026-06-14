// Server helper compartido para layouts del dashboard que viven fuera del
// segmento [role] (p. ej. /dashboard/eventos/*, /dashboard/clubes/*). Resuelve
// sesión, rol activo, profile, flags, banner y plan, y monta DashboardChrome
// con el mismo cableado que [role]/layout.tsx (sidebar + topbar + bottom nav
// + drawer + announcements). No incluye counters por rol porque esas pantallas
// son compartidas y no tienen contexto suficiente para badges.
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { DashboardChrome } from "./DashboardChrome";
import { getSession, ACTIVE_ROLE_COOKIE } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { getServerClient } from "@/lib/db/client.server";
import { getMyEffectiveFlags } from "@/server/actions/featureFlags";
import { SHOP_FLAG } from "@/lib/flags/shop";
import { getActiveAnnouncement } from "@/server/queries/announcements";
import type { RoleSwitchOption } from "./ActiveRoleSwitcher";

function isValidRole(r: string): r is RoleKey {
  return Object.prototype.hasOwnProperty.call(MP_ROLES, r);
}

type Options = {
  /** Slug opcional para mostrar como contextLabel (slug del evento/club). */
  contextLabel?: string | null;
  /** Path de fallback si no hay sesión. */
  loginNext?: string;
};

export async function renderDashboardChromeShell(
  children: ReactNode,
  options: Options = {},
) {
  const { contextLabel: contextLabelOverride = null, loginNext = "/dashboard/user" } = options;

  const session = await getSession();
  if (!session.authenticated) redirect(`/login?next=${loginNext}`);

  const supabase = await getServerClient();
  const { data: roleRows } = await supabase
    .from("role_assignments")
    .select("role,club_id,partner_id")
    .eq("user_id", session.session.userId)
    .is("revoked_at", null);

  const granted = new Set((roleRows ?? []).map((r) => r.role as RoleKey));
  const isAdmin = granted.has("admin");

  const cookieRole = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value;
  // Roles privilegiados primero. Si un partner/owner navega directo a estas
  // rutas sin pasar por su panel (que setea la cookie), no degradamos el
  // sidebar al chrome de jugador. Cambiar a user requiere usar el switcher.
  const fallbackPriority: RoleKey[] = ["admin", "owner", "partner", "manager", "coach", "employee", "user"];
  const role: RoleKey =
    cookieRole && isValidRole(cookieRole) && (granted.has(cookieRole) || isAdmin)
      ? cookieRole
      : fallbackPriority.find((r) => granted.has(r)) ?? "user";

  const roleSwitchOptions: RoleSwitchOption[] = [];
  const seenSwitch = new Set<RoleKey>();
  for (const row of roleRows ?? []) {
    const rk = row.role as RoleKey;
    if (rk === "admin" || seenSwitch.has(rk)) continue;
    seenSwitch.add(rk);
    roleSwitchOptions.push({
      role: rk,
      clubId: (row.club_id as string | null) ?? null,
      partnerId: (row.partner_id as string | null) ?? null,
    });
  }

  const [profile, { data: maint }, flagsRes, announcement, { data: planRow }] = await Promise.all([
    getProfileSummary(session.session.userId),
    supabase.from("feature_flags").select("enabled_default,description,impact").eq("key", "maintenance_banner").maybeSingle(),
    getMyEffectiveFlags(),
    getActiveAnnouncement(),
    supabase.from("profiles").select("plan_tier,plan_expires_at").eq("id", session.session.userId).maybeSingle(),
  ]);

  const userName = profile.displayName ?? profile.username ?? "Usuario";

  const contextLabel: string | null =
    contextLabelOverride ?? (role === "admin" ? "Plataforma · MATCHPOINT EC" : null);

  const flags: Record<string, boolean> = flagsRes.ok ? { ...flagsRes.data } : {};
  const planTier = (planRow?.plan_tier as string | null) ?? "free";
  const planExpiresAt = planRow?.plan_expires_at as string | null;
  const planActive = planTier === "premium" && (!planExpiresAt || new Date(planExpiresAt).getTime() > Date.now());
  flags["user_can_buy_mp_plus"] = !planActive;
  flags["user_has_mp_plus"] = planActive;
  flags[SHOP_FLAG] = flags[SHOP_FLAG] === true;

  const impactToLevel: Record<string, "info" | "warn" | "critical"> = { low: "info", med: "warn", high: "critical" };
  const banner = announcement
    ? announcement
    : maint?.enabled_default
      ? {
          message: (maint.description as string) || "Estamos en mantenimiento. Algunas funciones pueden fallar temporalmente.",
          level: impactToLevel[(maint.impact as string) ?? "high"] ?? "critical",
          ctaLabel: null,
          ctaHref: null,
        }
      : null;

  return (
    <DashboardChrome
      role={role}
      userName={userName}
      contextLabel={contextLabel}
      banner={banner}
      flags={flags}
      isAdmin={isAdmin}
      roleSwitchOptions={roleSwitchOptions}
    >
      {children}
    </DashboardChrome>
  );
}
