import { notFound, redirect } from "next/navigation";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import type { RoleSwitchOption } from "@/components/dashboard/ActiveRoleSwitcher";
import { RoleSwitcher } from "@/components/dashboard/RoleSwitcher";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { getServerClient } from "@/lib/db/client.server";
import { getMyEffectiveFlags } from "@/server/actions/featureFlags";
import { getActiveAnnouncement } from "@/server/queries/announcements";
import { decideDashboardRoleAccess } from "@/lib/auth/role-route-guard";
import { loadReceptionQueue } from "@/server/queries/reception-queue";
import { ACTIVE_ROLE_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";

function isValidRole(r: string): r is RoleKey {
  return Object.prototype.hasOwnProperty.call(MP_ROLES, r);
}

export default async function RoleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (!isValidRole(role)) notFound();

  // Server-side role guard. Proxy already verified an authenticated session;
  // here we check the URL `[role]` matches an actual role_assignment.
  // If not, redirect to one the user does have (or /login as last resort).
  const session = await getSession();
  if (!session.authenticated) redirect(`/?auth=signin&next=/dashboard/${role}`);

  const supabase = await getServerClient();
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id,partner_id")
    .eq("user_id", session.session.userId)
    .is("revoked_at", null);

  const granted = new Set((roles ?? []).map((r) => r.role as RoleKey));
  const isAdmin = granted.has("admin");
  const cookieRole = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value;

  const access = decideDashboardRoleAccess({
    urlRole: role,
    cookieRole,
    granted,
    isAdmin,
  });
  if (access.action === "redirect") {
    redirect(`/dashboard/${access.toRole}`);
  }

  const roleSwitchOptions: RoleSwitchOption[] = [];
  const seenSwitch = new Set<RoleKey>();
  for (const row of roles ?? []) {
    const rk = row.role as RoleKey;
    if (rk === "admin" || seenSwitch.has(rk)) continue;
    seenSwitch.add(rk);
    roleSwitchOptions.push({
      role: rk,
      clubId: (row.club_id as string | null) ?? null,
      partnerId: (row.partner_id as string | null) ?? null,
    });
  }

  // Resuelve nombre del usuario + contexto activo (club / partner) para los
  // chrome del dashboard. Sin esto, TopBar/Sidebar mostrarían datos hardcoded.
  // El profile se lee vía getProfileSummary (React.cache) — múltiples server
  // components del mismo render reutilizan la misma query.
  const [profile, { data: ownerRole }, { data: partnerMember }] = await Promise.all([
    getProfileSummary(session.session.userId),
    role === "owner" || role === "manager" || role === "employee" || role === "coach"
      ? supabase
          .from("role_assignments")
          .select("club_id,clubs(name,city)")
          .eq("user_id", session.session.userId)
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
          .eq("user_id", session.session.userId)
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

  // Counters dinámicos del sidebar (solo owner/manager con club asignado).
  // Reservas activas hoy + total de clientes únicos del club. Si la query
  // falla o el club aún no tiene actividad, los badges no se muestran.
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
      // Clientes únicos vía RPC (migration 101): hace count(distinct) en SQL
      // en lugar de traer todas las filas y deduplicar en memoria.
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

  // Coach: clases activas + alumnos únicos. No filtramos por club_id porque
  // un coach puede dictar en varios; el badge muestra el total propio.
  if (role === "coach") {
    const userId = session.session.userId;
    const [clases, enrollments] = await Promise.all([
      supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", userId),
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

  // Employee: check-ins pendientes hoy + walk-ins hoy. Requiere club_id.
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

  // User: clases activas + mensajes no leídos. Sin badge en ranking porque
  // un número suelto sin contexto confunde más que aclara.
  if (role === "user") {
    const userId = session.session.userId;
    const [clases, unreadRes] = await Promise.all([
      supabase
        .from("class_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("student_id", userId)
        .eq("status", "active"),
      // Mensajes no leídos: RPC fn_unread_messages_count (migration 100)
      // devuelve unread por conversación en 1 query. Antes eran 3 queries
      // secuenciales con traída completa de message ids.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("fn_unread_messages_count"),
    ]);
    const unreadRows = (unreadRes.data as Array<{ conversation_id: string; unread_count: number }> | null) ?? [];
    const totalUnread = unreadRows.reduce((acc, r) => acc + (r.unread_count ?? 0), 0);
    badgeOverrides = {
      "mis-clases": clases.count ?? 0,
      "chat": totalUnread,
    };
  }

  // Admin: counts globales de la plataforma. No filtramos por tenant
  // porque admin ve todo. Formateamos números grandes como "1.2k".
  if (role === "admin") {
    const [clubsCount, usersCount, modCount, supportCount, flagsCount] = await Promise.all([
      supabase.from("clubs").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("feature_flags").select("key", { count: "exact", head: true }).eq("enabled_default", true),
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

  // Partner: torneos del partner + inscritos totales + ligas activas.
  // Lee el partner_id desde partner_members (puede tener varios; usamos el
  // primero por joined_at asc, mismo criterio que el contextLabel).
  if (role === "partner") {
    const userId = session.session.userId;
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
        supabase
          .from("leagues")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", partnerId),
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
          ? partnerOrg?.name ?? null
          : ownerClub?.name
            ? [ownerClub.name, ownerClub.city].filter(Boolean).join(" · ")
            : null;

  // Flags efectivos del usuario (para gatear items del sidebar) + banner de
  // mantenimiento. Una sola lectura de feature_flags para el banner; los flags
  // efectivos vienen del rpc fn_my_effective_flags (respeta excepciones/rollout).
  const [{ data: maint }, flagsRes, announcement, { data: planRow }] = await Promise.all([
    supabase.from("feature_flags").select("enabled_default,description,impact").eq("key", "maintenance_banner").maybeSingle(),
    getMyEffectiveFlags(),
    getActiveAnnouncement(),
    supabase.from("profiles").select("plan_tier,plan_expires_at").eq("id", session.session.userId).maybeSingle(),
  ]);
  const flags: Record<string, boolean> = flagsRes.ok ? { ...flagsRes.data } : {};
  // Flag sintético: el item "MATCHPOINT+" del sidebar se oculta si el user
  // ya tiene MP+ activo. Esto NO vive en feature_flags (es estado por usuario).
  const planTier = (planRow?.plan_tier as string | null) ?? "free";
  const planExpiresAt = planRow?.plan_expires_at as string | null;
  const planActive = planTier === "premium" && (!planExpiresAt || new Date(planExpiresAt).getTime() > Date.now());
  flags["user_can_buy_mp_plus"] = !planActive;
  flags["user_has_mp_plus"] = planActive;
  // Banner global: el anuncio activo (canal Banner de Comunicaciones) tiene
  // prioridad; si no hay, cae al flag maintenance_banner.
  const impactToLevel: Record<string, "info" | "warn" | "critical"> = { low: "info", med: "warn", high: "critical" };
  const banner = announcement
    ? announcement
    : maint?.enabled_default
      ? {
          message: (maint.description as string) || "Estamos en mantenimiento. Algunas funciones pueden fallar temporalmente.",
          level: impactToLevel[(maint.impact as string) ?? "high"] ?? "critical",
          ctaLabel: null,
          ctaHref: null,
        }
      : null;

  return (
    <>
      <DashboardChrome
        role={role}
        userName={userName}
        contextLabel={contextLabel}
        badgeOverrides={badgeOverrides}
        banner={banner}
        flags={flags}
        roleSwitchOptions={!isAdmin ? roleSwitchOptions : undefined}
      >
        {children}
      </DashboardChrome>
      {isAdmin && <RoleSwitcher current={role} />}
    </>
  );
}
