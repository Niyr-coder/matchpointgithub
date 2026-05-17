// Server: equipo del club desde role_assignments + profiles.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { ClubStaffScreenView, type StaffData, type StaffMember } from "./ClubStaffScreenView";

const ROLE_LABEL: Record<string, string> = {
  owner: "Dueño",
  manager: "Manager",
  coach: "Coach",
  employee: "Recepcionista",
};

const AV_GRADIENTS = [
  "linear-gradient(135deg,#0ea5e9,#0369a1)",
  "linear-gradient(135deg,#10b981,#34d399)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AV_GRADIENTS[Math.abs(h) % AV_GRADIENTS.length];
}

async function loadData(): Promise<StaffData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return { clubId: null, staff: [] };

  const supabase = await getServerClient();
  const { data: assignments } = await supabase
    .from("role_assignments")
    .select("id,user_id,role,granted_at")
    .eq("club_id", clubId)
    .in("role", ["owner", "manager", "coach", "employee"])
    .is("revoked_at", null)
    .order("granted_at", { ascending: true });

  const userIds = Array.from(new Set((assignments ?? []).map((a) => a.user_id as string)));
  if (userIds.length === 0) return { clubId, staff: [] };

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,display_name,avatar_url")
    .in("id", userIds);

  const profById = new Map<string, { display_name: string; avatar_url: string | null }>();
  for (const p of profiles ?? []) {
    profById.set(p.id as string, {
      display_name: p.display_name as string,
      avatar_url: (p.avatar_url as string | null) ?? null,
    });
  }

  // Dedup: si un usuario tiene varios roles en el club, quedarnos con el de mayor jerarquía.
  const rank: Record<string, number> = { owner: 0, manager: 1, coach: 2, employee: 3 };
  const bestByUser = new Map<string, { role: string; assignmentId: string }>();
  for (const a of assignments ?? []) {
    const u = a.user_id as string;
    const r = a.role as string;
    const prev = bestByUser.get(u);
    if (!prev || rank[r] < rank[prev.role]) {
      bestByUser.set(u, { role: r, assignmentId: a.id as string });
    }
  }

  const staff: StaffMember[] = Array.from(bestByUser.entries()).map(([userId, info]) => {
    const prof = profById.get(userId);
    const name = prof?.display_name ?? "Sin nombre";
    return {
      id: userId,
      assignmentId: info.assignmentId,
      name,
      role: ROLE_LABEL[info.role] ?? info.role,
      roleKey: info.role,
      av: initials(name),
      avBg: gradientFor(userId),
      avatarUrl: prof?.avatar_url ?? null,
    };
  });

  return { clubId, staff };
}

export async function ClubStaffScreen() {
  const data = await loadData();
  return <ClubStaffScreenView data={data} />;
}
