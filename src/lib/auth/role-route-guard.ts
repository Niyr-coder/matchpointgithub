import type { RoleKey } from "@/lib/roles";

/** Segmentos válidos bajo `/dashboard/[role]`. */
export const DASHBOARD_ROLE_KEYS = [
  "admin",
  "partner",
  "owner",
  "manager",
  "coach",
  "employee",
  "user",
] as const satisfies readonly RoleKey[];

/** Redirección cuando la URL pide un rol no asignado (no admin). */
export const ROLE_FALLBACK_PRIORITY: RoleKey[] = [
  "owner",
  "manager",
  "partner",
  "coach",
  "employee",
  "user",
];

/** Cookie inicial tras login (mismo criterio que signIn). */
export const ROLE_LOGIN_PRIORITY: RoleKey[] = [
  "admin",
  "owner",
  "manager",
  "partner",
  "coach",
  "employee",
  "user",
];

export function isDashboardRoleKey(r: string): r is RoleKey {
  return (DASHBOARD_ROLE_KEYS as readonly string[]).includes(r);
}

export type RoleRouteDecision =
  | { action: "allow"; syncCookieTo: RoleKey | null }
  | { action: "redirect"; toRole: RoleKey };

/**
 * Autorización de navegación por rol en el dashboard.
 *
 * - Admin: puede abrir cualquier segmento (view-as); la cookie sigue la URL.
 * - Resto: la URL debe coincidir con `mp_active_role`. Cambiar de rol solo vía
 *   `switchRole`, no escribiendo `/dashboard/otro-rol` en la barra.
 */
export function decideDashboardRoleAccess(opts: {
  urlRole: RoleKey;
  cookieRole: string | null | undefined;
  granted: Set<RoleKey>;
  isAdmin: boolean;
}): RoleRouteDecision {
  const { urlRole, granted, isAdmin } = opts;
  const cookie =
    opts.cookieRole && isDashboardRoleKey(opts.cookieRole) && granted.has(opts.cookieRole)
      ? opts.cookieRole
      : null;

  if (!granted.has(urlRole) && !isAdmin) {
    const fallback = ROLE_FALLBACK_PRIORITY.find((r) => granted.has(r)) ?? "user";
    return { action: "redirect", toRole: fallback };
  }

  if (isAdmin) {
    return { action: "allow", syncCookieTo: urlRole };
  }

  if (cookie && cookie !== urlRole) {
    return { action: "redirect", toRole: cookie };
  }

  if (!cookie && granted.has(urlRole)) {
    return { action: "allow", syncCookieTo: urlRole };
  }

  return { action: "allow", syncCookieTo: null };
}
