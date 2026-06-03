import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { notify } from "@/server/notifications/dispatch";

type MpRole = "admin" | "partner" | "user" | "owner" | "manager" | "coach" | "employee";

const KNOWN_ROLES = new Set<MpRole>([
  "admin",
  "partner",
  "owner",
  "manager",
  "coach",
  "employee",
  "user",
]);

/** Rol de destino en `notifications.recipient_role` según el rol asignado/solicitado. */
export function recipientRoleForAssignedRole(role: string): MpRole {
  if (KNOWN_ROLES.has(role as MpRole)) return role as MpRole;
  return "user";
}

/** Notifica owner/manager activos de un club (best-effort). */
export async function notifyClubStaff(args: {
  clubId: string;
  kind: string;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown>;
  roles?: Array<"owner" | "manager">;
}): Promise<number> {
  const roles = args.roles ?? ["owner", "manager"];
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("role_assignments")
    .select("user_id,role")
    .eq("club_id", args.clubId)
    .in("role", roles)
    .is("revoked_at", null);
  if (error) {
    console.error("[notifyClubStaff] load staff failed:", error.message);
    return 0;
  }
  const seen = new Set<string>();
  let sent = 0;
  for (const row of data ?? []) {
    const uid = row.user_id as string;
    const role = row.role as MpRole;
    const key = `${uid}:${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = await notify({
      userId: uid,
      role,
      kind: args.kind,
      title: args.title,
      body: args.body,
      payload: args.payload,
    });
    if (id) sent += 1;
  }
  return sent;
}

/** Notifica miembros owner/admin de una partner org (best-effort). */
export async function notifyPartnerOrgStaff(args: {
  partnerId: string;
  kind: string;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown>;
}): Promise<number> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("partner_members")
    .select("user_id")
    .eq("partner_id", args.partnerId)
    .in("role", ["owner", "admin"]);
  if (error) {
    console.error("[notifyPartnerOrgStaff] load members failed:", error.message);
    return 0;
  }
  const seen = new Set<string>();
  let sent = 0;
  for (const row of data ?? []) {
    const uid = row.user_id as string;
    if (seen.has(uid)) continue;
    seen.add(uid);
    const id = await notify({
      userId: uid,
      role: "partner",
      kind: args.kind,
      title: args.title,
      body: args.body,
      payload: args.payload,
    });
    if (id) sent += 1;
  }
  return sent;
}
