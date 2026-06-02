import { MP_ROLES, type RoleKey } from "@/lib/roles";

export type RoleBadgeMeta = {
  label: string;
  title: string;
  icon: string;
  color: string;
  background: string;
  borderColor: string;
};

const PUBLIC_ROLE_KEYS = new Set<RoleKey>(["owner", "partner", "coach"]);

const SOFT_BACKGROUND: Record<RoleKey, string> = {
  admin: "rgba(220,38,38,0.12)",
  owner: "rgba(10,10,10,0.08)",
  manager: "rgba(14,165,233,0.12)",
  partner: "rgba(124,58,237,0.12)",
  coach: "rgba(245,158,11,0.14)",
  employee: "rgba(16,185,129,0.12)",
  user: "rgba(16,185,129,0.12)",
};

const SOFT_BORDER: Record<RoleKey, string> = {
  admin: "rgba(220,38,38,0.24)",
  owner: "rgba(10,10,10,0.16)",
  manager: "rgba(14,165,233,0.24)",
  partner: "rgba(124,58,237,0.24)",
  coach: "rgba(245,158,11,0.28)",
  employee: "rgba(16,185,129,0.24)",
  user: "rgba(16,185,129,0.24)",
};

export function isRoleKey(value: string | null | undefined): value is RoleKey {
  return !!value && value in MP_ROLES;
}

export function roleBadgeMeta(role: RoleKey): RoleBadgeMeta {
  const cfg = MP_ROLES[role];
  return {
    label: cfg.badge,
    title: `Rol activo: ${cfg.badge}`,
    icon: cfg.icon,
    color: cfg.color,
    background: SOFT_BACKGROUND[role],
    borderColor: SOFT_BORDER[role],
  };
}

export function publicRoleBadgeMeta(role: string | null | undefined): RoleBadgeMeta | null {
  if (!isRoleKey(role) || !PUBLIC_ROLE_KEYS.has(role)) return null;
  const meta = roleBadgeMeta(role);
  return {
    ...meta,
    title: `${meta.label} en MATCHPOINT`,
  };
}

export function isPublicRoleBadgeVisible(role: string | null | undefined): boolean {
  return publicRoleBadgeMeta(role) != null;
}
