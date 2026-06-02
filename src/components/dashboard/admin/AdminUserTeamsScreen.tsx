// Admin · Teams de usuarios — server component que carga la lista completa
// + counts agregados que necesita el view. Va el rediseño completo del kit
// (`ui_kits/dashboard/AdminTeamsScreen.jsx`). Las acciones de moderación
// admin ya están cableadas a backend; el editor de política sigue staged.
import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { sportLabel } from "@/lib/sports";
import { listOpenTeamReportsServer } from "@/server/actions/team-reports";
import { AdminUserTeamsScreenView, type AdminTeamRow } from "./AdminUserTeamsScreenView";

const PRIVACY_FALLBACK: AdminTeamRow["privacy"] = "public";

function normalizePrivacy(p: unknown): AdminTeamRow["privacy"] {
  if (p === "public" || p === "invite" || p === "private") return p;
  return PRIVACY_FALLBACK;
}

function sportDisplay(s: unknown): string {
  if (typeof s !== "string") return "Multi";
  return sportLabel(s);
}

async function loadAdminTeams(): Promise<{
  teams: AdminTeamRow[];
  totalUsers: number;
}> {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: teamsRaw, error } = await (admin as any)
    .from("teams")
    .select(
      "id,name,slug,tag,color,sport,captain_id,created_at,privacy,status,is_verified,is_pinned,club_id,clubs(city),profiles!teams_captain_id_fkey(display_name,plan_tier,plan_expires_at)",
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[AdminUserTeamsScreen] loadAdminTeams", error.message);
    return { teams: [], totalUsers: 0 };
  }
  // Total de usuarios (denominador de "Penetración social" del hero).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: usersCountRaw } = await (admin as any)
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_system", false);
  const totalUsers = (usersCountRaw as number | null) ?? 0;

  const teams = (teamsRaw ?? []) as Array<Record<string, unknown>>;
  if (teams.length === 0) return { teams: [], totalUsers };

  const ids = teams.map((t) => t.id as string);

  // Counts agregados en queries separadas — RLS via service-role.
  const [{ data: members }, { data: achievements }, { data: openReports }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("team_members").select("team_id").in("team_id", ids),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("team_achievements").select("team_id").in("team_id", ids),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from("team_reports")
      .select("team_id")
      .in("team_id", ids)
      .eq("status", "open"),
  ]);
  const memberCount = new Map<string, number>();
  for (const m of (members ?? []) as Array<{ team_id: string }>) {
    memberCount.set(m.team_id, (memberCount.get(m.team_id) ?? 0) + 1);
  }
  const achievementCount = new Map<string, number>();
  for (const a of (achievements ?? []) as Array<{ team_id: string }>) {
    achievementCount.set(a.team_id, (achievementCount.get(a.team_id) ?? 0) + 1);
  }
  const reportsCount = new Map<string, number>();
  for (const r of (openReports ?? []) as Array<{ team_id: string }>) {
    reportsCount.set(r.team_id, (reportsCount.get(r.team_id) ?? 0) + 1);
  }

  const mapped: AdminTeamRow[] = teams.map((t) => {
    const captainProfile = t.profiles as { display_name?: string; plan_tier?: string } | null;
    const club = t.clubs as { city?: string } | null;
    const tag =
      ((t.tag as string | null) ?? (t.slug as string | null) ?? "TEAM")
        .slice(0, 4)
        .toUpperCase();
    const rosterMax = captainProfile?.plan_tier === "premium" ? 24 : 12;
    const founded = new Date(t.created_at as string);
    return {
      id: t.id as string,
      tag,
      name: t.name as string,
      slug: t.slug as string,
      sport: sportDisplay(t.sport),
      city: club?.city ?? null,
      color: (t.color as string | null) ?? "#10b981",
      privacy: normalizePrivacy(t.privacy),
      members: memberCount.get(t.id as string) ?? 0,
      rosterMax,
      achievementsCount: achievementCount.get(t.id as string) ?? 0,
      reportsCount: reportsCount.get(t.id as string) ?? 0,
      captainId: t.captain_id as string,
      captainName: captainProfile?.display_name ?? "—",
      createdAt: founded.toISOString(),
      status:
        ((t as Record<string, unknown>).status as AdminTeamRow["status"]) ?? "active",
      isVerified: (t as Record<string, unknown>).is_verified === true,
      isPinned: (t as Record<string, unknown>).is_pinned === true,
    };
  });
  return { teams: mapped, totalUsers };
}

export async function AdminUserTeamsScreen() {
  const [{ teams, totalUsers }, openReports] = await Promise.all([
    loadAdminTeams(),
    listOpenTeamReportsServer(20),
  ]);
  return (
    <AdminUserTeamsScreenView
      teams={teams}
      totalUsers={totalUsers}
      openReports={openReports}
    />
  );
}
