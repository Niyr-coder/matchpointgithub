import { MP_ROLES, type RoleKey } from "@/lib/roles";

function isValidRole(r: string): r is RoleKey {
  return Object.prototype.hasOwnProperty.call(MP_ROLES, r);
}

/** Prioridad cuando la ruta no trae `[role]` en la URL (clubes, eventos, etc.). */
export const OFF_SEGMENT_ROLE_PRIORITY: RoleKey[] = [
  "admin",
  "owner",
  "partner",
  "manager",
  "coach",
  "employee",
  "user",
];

export function resolveOffSegmentDashboardRole(opts: {
  cookieRole: string | undefined;
  granted: Set<RoleKey>;
  isAdmin: boolean;
}): RoleKey {
  const { cookieRole, granted, isAdmin } = opts;
  if (cookieRole && isValidRole(cookieRole) && (granted.has(cookieRole) || isAdmin)) {
    return cookieRole;
  }
  return OFF_SEGMENT_ROLE_PRIORITY.find((r) => granted.has(r)) ?? "user";
}

/** Rol para rutas bajo /dashboard/partner/* (torneo gestión, etc.). */
export function resolvePartnerSegmentRole(opts: {
  sessionActiveRole: RoleKey | null | undefined;
  isAdmin: boolean;
  hasPartner: boolean;
}): RoleKey {
  const { sessionActiveRole, isAdmin, hasPartner } = opts;
  if (sessionActiveRole === "admin" || sessionActiveRole === "partner") {
    return sessionActiveRole;
  }
  if (isAdmin) return "admin";
  if (hasPartner) return "partner";
  return "user";
}

/** Inicio del dashboard según cookie mp_active_role (fallback si no hay cookie válida). */
export function resolveDashboardHomeRole(opts: {
  cookieRole: string | undefined;
  granted: Set<RoleKey>;
  isAdmin: boolean;
  fallback: RoleKey;
}): RoleKey {
  const { cookieRole, granted, isAdmin, fallback } = opts;
  if (cookieRole && isValidRole(cookieRole) && (granted.has(cookieRole) || isAdmin)) {
    return cookieRole;
  }
  return fallback;
}

export function dashboardHomePath(role: RoleKey): string {
  return `/dashboard/${role}`;
}
