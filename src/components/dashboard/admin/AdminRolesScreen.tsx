// Server: matriz de roles + miembros por rol + role_requests pendientes + clubes disponibles.
import { getServerClient } from "@/lib/db/client.server";
import {
  type RolesData,
  type RoleMember,
  type RoleRequest,
  type ClubOption,
} from "./AdminRolesScreenView";
// MERGE: el rediseño v2 (AdminRolesView) consume estos datos reales. La view
// vieja (AdminRolesScreenView) queda como fuente de tipos + respaldo.
import { AdminRolesView } from "./AdminRolesView";

const ROLE_KEYS = ["admin", "partner", "owner", "manager", "coach", "employee", "user"] as const;
export const MEMBER_PAGE = 8; // preview corto por rol que precarga el server (el resto se busca)

async function loadData(): Promise<RolesData> {
  const supabase = await getServerClient();
  // counts vía agregado (NO traemos todas las filas de role_assignments: el rol
  // 'user' tiene miles). Miembros: solo la primera página (MEMBER_PAGE) por rol.
  const [countRes, { data: requests }, { data: clubs }, { data: caps }, { data: roleCaps }, ...memberRes] = await Promise.all([
    supabase.rpc("fn_role_member_counts"),
    supabase
      .from("role_requests")
      .select("id,user_id,requested_role,target_club_id,reason,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase.from("clubs").select("id,name").eq("status", "active").order("name"),
    supabase.from("capabilities").select("key,domain,label,sort").order("sort"),
    supabase.from("role_capabilities").select("role,cap_key,level"),
    ...ROLE_KEYS.map((role) =>
      supabase
        .from("role_assignments")
        .select("id,user_id,role,club_id,granted_at")
        .eq("role", role)
        .is("revoked_at", null)
        .order("granted_at", { ascending: false })
        .limit(MEMBER_PAGE),
    ),
  ]);

  const counts: Record<string, number> = {};
  for (const c of (countRes.data ?? []) as { role: string; n: number }[]) counts[c.role] = Number(c.n);

  const memberRows = memberRes.flatMap((q) => q.data ?? []);

  // Matriz RBAC real (mig 158): rol → capKey → nivel.
  const matrix: Record<string, Record<string, string>> = {};
  for (const rc of roleCaps ?? []) {
    const role = rc.role as string;
    (matrix[role] ||= {})[rc.cap_key as string] = rc.level as string;
  }
  const capCatalog = (caps ?? []).map((c) => ({ key: c.key as string, domain: c.domain as string, label: c.label as string }));

  const userIds = Array.from(
    new Set([
      ...memberRows.map((a) => a.user_id as string),
      ...(requests ?? []).map((r) => r.user_id as string),
    ]),
  );
  const clubIds = Array.from(
    new Set([
      ...(memberRows.map((a) => a.club_id as string | null).filter(Boolean) as string[]),
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

  const membersByRole = new Map<string, RoleMember[]>();
  for (const a of memberRows) {
    const role = a.role as string;
    const uid = a.user_id as string;
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
    matrix,
    capCatalog,
  };
}

export async function AdminRolesScreen() {
  const data = await loadData();
  return <AdminRolesView data={data} />;
}
