// Server: matriz de roles + miembros por rol + role_requests pendientes + clubes disponibles.
import { getServerClient } from "@/lib/db/client.server";
import {
  AdminRolesScreenView,
  type RolesData,
  type RoleMember,
  type RoleRequest,
  type ClubOption,
} from "./AdminRolesScreenView";

async function loadData(): Promise<RolesData> {
  const supabase = await getServerClient();
  const [{ data: assignments }, { data: requests }, { data: clubs }] = await Promise.all([
    supabase
      .from("role_assignments")
      .select("id,user_id,role,club_id,granted_at")
      .is("revoked_at", null),
    supabase
      .from("role_requests")
      .select("id,user_id,requested_role,target_club_id,reason,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase.from("clubs").select("id,name").eq("status", "active").order("name"),
  ]);

  const userIds = Array.from(
    new Set([
      ...(assignments ?? []).map((a) => a.user_id as string),
      ...(requests ?? []).map((r) => r.user_id as string),
    ]),
  );
  const clubIds = Array.from(
    new Set([
      ...(assignments ?? []).map((a) => a.club_id as string | null).filter(Boolean) as string[],
      ...(requests ?? []).map((r) => r.target_club_id as string | null).filter(Boolean) as string[],
    ]),
  );

  const [{ data: profs }, { data: relatedClubs }] = await Promise.all([
    userIds.length > 0
      ? supabase.from("profiles").select("id,username,display_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
    clubIds.length > 0
      ? supabase.from("clubs").select("id,name").in("id", clubIds)
      : Promise.resolve({ data: [] }),
  ]);
  const profileById = new Map<string, { username: string; display_name: string }>();
  for (const p of profs ?? []) {
    profileById.set(p.id as string, {
      username: p.username as string,
      display_name: p.display_name as string,
    });
  }
  const clubName = new Map<string, string>();
  for (const c of relatedClubs ?? []) clubName.set(c.id as string, c.name as string);

  const counts: Record<string, number> = {};
  const membersByRole = new Map<string, RoleMember[]>();
  const distinctByRole = new Map<string, Set<string>>();
  for (const a of assignments ?? []) {
    const role = a.role as string;
    const uid = a.user_id as string;
    if (!distinctByRole.has(role)) distinctByRole.set(role, new Set());
    distinctByRole.get(role)!.add(uid);
    const prof = profileById.get(uid);
    if (!membersByRole.has(role)) membersByRole.set(role, []);
    membersByRole.get(role)!.push({
      assignmentId: a.id as string,
      userId: uid,
      username: prof?.username ?? "—",
      displayName: prof?.display_name ?? "Sin nombre",
      clubId: (a.club_id as string | null) ?? null,
      clubName: a.club_id ? clubName.get(a.club_id as string) ?? "—" : null,
      grantedAt: a.granted_at as string,
    });
  }
  for (const [role, set] of distinctByRole) counts[role] = set.size;

  const pendingRequests: RoleRequest[] = (requests ?? []).map((r) => {
    const prof = profileById.get(r.user_id as string);
    return {
      id: r.id as string,
      userId: r.user_id as string,
      username: prof?.username ?? "—",
      displayName: prof?.display_name ?? "Sin nombre",
      requestedRole: r.requested_role as string,
      targetClubId: (r.target_club_id as string | null) ?? null,
      targetClubName: r.target_club_id ? clubName.get(r.target_club_id as string) ?? "—" : null,
      reason: (r.reason as string | null) ?? null,
      createdAt: r.created_at as string,
    };
  });

  const clubOptions: ClubOption[] = (clubs ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  return {
    counts,
    members: Object.fromEntries(membersByRole),
    requests: pendingRequests,
    clubs: clubOptions,
  };
}

export async function AdminRolesScreen() {
  const data = await loadData();
  return <AdminRolesScreenView data={data} />;
}
