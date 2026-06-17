// Política MFA staff — importable desde cliente y servidor (sin secretos).
import type { RoleKey } from "@/lib/roles";

/** Feature flag global. Off = gate y asserts no-op. */
export const STAFF_MFA_FLAG = "staff_mfa_required";

/** Roles operativos que exigen TOTP cuando el flag está on. Jugador (`user`) excluido. */
export const STAFF_DASHBOARD_ROLES = [
  "admin",
  "owner",
  "manager",
  "partner",
  "coach",
  "employee",
] as const satisfies readonly RoleKey[];

export type StaffDashboardRole = (typeof STAFF_DASHBOARD_ROLES)[number];

export function isStaffDashboardRole(role: RoleKey): role is StaffDashboardRole {
  return role !== "user";
}

export type MfaAssuranceLevel = "aal1" | "aal2";

export type StaffMfaState =
  | "not_required"
  | "enroll_required"
  | "verify_required"
  | "satisfied";

export function safeMfaNext(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.startsWith("/auth/mfa")) return fallback;
  return raw;
}

export function buildMfaRedirectPath(
  mode: "enroll" | "verify",
  next: string,
): string {
  return `/auth/mfa/${mode}?next=${encodeURIComponent(safeMfaNext(next, "/dashboard/user"))}`;
}
