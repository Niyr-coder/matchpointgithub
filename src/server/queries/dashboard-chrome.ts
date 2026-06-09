import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { RoleKey } from "@/lib/roles";
import type { RoleSwitchOption } from "@/components/dashboard/ActiveRoleSwitcher";
import { getProfileSummary } from "@/lib/auth/profile";
import { getMyEffectiveFlags } from "@/server/actions/featureFlags";
import { getActiveAnnouncement } from "@/server/queries/announcements";
import { loadReceptionQueue } from "@/server/queries/reception-queue";

export type DashboardChromeProps = {
  role: RoleKey;
  userName: string;
  contextLabel: string | null;
  /** Inicio del rol activo (cookie mp_active_role). */
  homeHref: string;
  badgeOverrides?: Record<string, number | string>;
  banner?: {
    message: string;
    level: "info" | "warn" | "critical";
    ctaLabel?: string | null;
    ctaHref?: string | null;
  } | null;
  flags?: Record<string, boolean>;
  roleSwitchOptions?: RoleSwitchOption[];
};

type RoleRow = {
  role: string;
  club_id: string | null;
  partner_id: string | null;
};

export function buildRoleSwitchOptions(
  rows: RoleRow[],
  isAdmin: boolean,
): RoleSwitchOption[] {
  if (isAdmin) return [];
  const out: RoleSwitchOption[] = [];
  const seen = new Set<RoleKey>();
  for (const row of rows) {
    const rk = row.role as RoleKey;
    if (rk === "admin" || seen.has(rk)) continue;
    seen.add(rk);
    out.push({
      role: rk,
      clubId: row.club_id,
      partnerId: row.partner_id,
    });
  }
  return out;
}

/** Props compartidas para DashboardChrome (sidebar + topbar + bottom nav mobile). */
export async function loadDashboardChromeProps(opts: {
  role: RoleKey;
  userId: string;
  supabase: SupabaseClient<Database>;
  homeHref: string;
  roleSwitchOptions?: RoleSwitchOption[];
}): Promise<DashboardChromeProps> {
  const { role, userId, supabase, homeHref, roleSwitchOptions } = opts;

  const [profile, { data: ownerRole }, { data: partnerMember }] = await Promise.all([
    getProfileSummary(userId),
    role === "owner" || role === "manager" || role === "employee" || role === "coach"
      ? supabase
          .from("role_assignments")
          .select("club_id,clubs(name,city)")
          .eq("user_id", userId)
          .eq("role", role)
          .is("revoked_at", null)
          .not("club_id", "is", null)
          .order("granted_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    role === "partner"
      ? supabase
          .from("partner_members")
          .select("partner_orgs(name)")
          .eq("user_id", userId)
          .order("joined_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const userName = profile.displayName ?? profile.username ?? "Usuario";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerClub = (ownerRole as any)?.clubs as { name?: string; city?: string } | null | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clubId = (ownerRole as any)?.club_id as string | null | undefined;

  let badgeOverrides: Record<string, number | string> | undefined;

  if (clubId && (role === "owner" || role === "manager")) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [resHoy, clientesRes, walkinsHoy] = await Promise.all([
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .is("cancelled_at", null)
        .overlaps("during", `[${todayStart.toISOString()},${tomorrowStart.toISOString()})`),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("fn_unique_organizers_count", { p_club_id: clubId }),
      role === "manager"
        ? supabase
            .from("walkins")
            .select("id", { count: "exact", head: true })
            .eq("club_id", clubId)
            .gte("created_at", todayStart.toISOString())
            .lt("created_at", tomorrowStart.toISOString())
        : Promise.resolve({ count: 0 }),
    ]);

    const uniqueOrganizersCount =
      typeof clientesRes.data === "number" ? (clientesRes.data as number) : 0;

    badgeOverrides = {
      "club-reservas": resHoy.count ?? 0,
      "club-clientes": uniqueOrganizersCount,
      "club-walkins": walkinsHoy.count ?? 0,
    };
  }

  if (role === "coach") {
    const [clases, enrollments] = await Promise.all([
      supabase.from("classes").select("id", { count: "exact", head: true }).eq("coach_id", userId),
      supabase
        .from("class_enrollments")
        .select("student_id, classes!inner(coach_id)")
        .eq("classes.coach_id", userId)
        .eq("status", "active"),
    ]);
    const uniqueStudents = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (((enrollments as any)?.data ?? []) as Array<{ student_id: string | null }>)
        .map((r) => r.student_id)
        .filter(Boolean) as string[],
    );
    badgeOverrides = {
      "c-clases": clases.count ?? 0,
      "c-alumnos": uniqueStudents.size,
    };
  }

  if (clubId && role === "employee") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [queue, walkinsHoy] = await Promise.all([
      loadReceptionQueue(supabase, clubId, { windowHours: 18, limit: 50 }),
      supabase
        .from("walkins")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .is("created_reservation_id", null)
        .gte("created_at", todayStart.toISOString())
        .lt("created_at", tomorrowStart.toISOString()),
    ]);
    badgeOverrides = {
      "e-checkin": queue.length,
      "e-walkins": walkinsHoy.count ?? 0,
    };
  }

  if (role === "user") {
    const [clases, unreadRes] = await Promise.all([
      supabase
        .from("class_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("student_id", userId)
        .eq("status", "active"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("fn_unread_messages_count"),
    ]);
    const unreadRows =
      (unreadRes.data as Array<{ conversation_id: string; unread_count: number }> | null) ?? [];
    const totalUnread = unreadRows.reduce((acc, r) => acc + (r.unread_count ?? 0), 0);
    badgeOverrides = {
      "mis-clases": clases.count ?? 0,
      chat: totalUnread,
    };
  }

  if (role === "admin") {
    const [clubsCount, usersCount, modCount, supportCount, flagsCount] = await Promise.all([
      supabase.from("clubs").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase
        .from("feature_flags")
        .select("key", { count: "exact", head: true })
        .eq("enabled_default", true),
    ]);
    const fmt = (n: number): string => {
      if (n >= 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
      if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
      return String(n);
    };
    badgeOverrides = {
      "admin-clubs": fmt(clubsCount.count ?? 0),
      "admin-users": fmt(usersCount.count ?? 0),
      "admin-mod": modCount.count ?? 0,
      "admin-support": supportCount.count ?? 0,
      "admin-flags": flagsCount.count ?? 0,
    };
  }

  if (role === "partner") {
    const { data: pm } = await supabase
      .from("partner_members")
      .select("partner_id")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const partnerId = (pm as { partner_id?: string } | null)?.partner_id;
    if (partnerId) {
      const [torneos, ligas, inscritos] = await Promise.all([
        supabase
          .from("tournaments")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", partnerId),
        supabase.from("leagues").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        supabase
          .from("registrations")
          .select("id, tournaments!inner(partner_id)", { count: "exact", head: true })
          .eq("tournaments.partner_id", partnerId)
          .eq("status", "accepted"),
      ]);
      badgeOverrides = {
        "p-torneos": torneos.count ?? 0,
        "p-ligas": ligas.count ?? 0,
        "p-inscritos": inscritos.count ?? 0,
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partnerOrg = (partnerMember as any)?.partner_orgs as { name?: string } | null | undefined;
  const contextLabel: string | null =
    role === "admin"
      ? "Plataforma · MATCHPOINT EC"
      : role === "user"
        ? null
        : role === "partner"
          ? (partnerOrg?.name ?? null)
          : ownerClub?.name
            ? [ownerClub.name, ownerClub.city].filter(Boolean).join(" · ")
            : null;

  const [{ data: maint }, flagsRes, announcement, { data: planRow }] = await Promise.all([
    supabase
      .from("feature_flags")
      .select("enabled_default,description,impact")
      .eq("key", "maintenance_banner")
      .maybeSingle(),
    getMyEffectiveFlags(),
    getActiveAnnouncement(),
    supabase.from("profiles").select("plan_tier,plan_expires_at").eq("id", userId).maybeSingle(),
  ]);
  const flags: Record<string, boolean> = flagsRes.ok ? { ...flagsRes.data } : {};
  const planTier = (planRow?.plan_tier as string | null) ?? "free";
  const planExpiresAt = planRow?.plan_expires_at as string | null;
  const planActive =
    planTier === "premium" && (!planExpiresAt || new Date(planExpiresAt).getTime() > Date.now());
  flags["user_can_buy_mp_plus"] = !planActive;
  flags["user_has_mp_plus"] = planActive;

  const impactToLevel: Record<string, "info" | "warn" | "critical"> = {
    low: "info",
    med: "warn",
    high: "critical",
  };
  const banner = announcement
    ? announcement
    : maint?.enabled_default
      ? {
          message:
            (maint.description as string) ||
            "Estamos en mantenimiento. Algunas funciones pueden fallar temporalmente.",
          level: impactToLevel[(maint.impact as string) ?? "high"] ?? "critical",
          ctaLabel: null,
          ctaHref: null,
        }
      : null;

  return {
    role,
    userName,
    contextLabel,
    homeHref,
    badgeOverrides,
    banner,
    flags,
    roleSwitchOptions,
  };
}
