import { notFound, redirect } from "next/navigation";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { RoleSwitcher } from "@/components/dashboard/RoleSwitcher";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { getServerClient } from "@/lib/db/client.server";

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
    .select("role")
    .eq("user_id", session.session.userId)
    .is("revoked_at", null);

  const granted = new Set((roles ?? []).map((r) => r.role as RoleKey));
  const isAdmin = granted.has("admin");

  // Admin can "view as" any role (that's the point of the dev switcher).
  // Everyone else gets redirected to their own role's dashboard.
  if (!isAdmin && !granted.has(role)) {
    const priority: RoleKey[] = ["owner", "manager", "partner", "coach", "employee", "user"];
    const fallback = priority.find((r) => granted.has(r)) ?? "user";
    redirect(`/dashboard/${fallback}`);
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

    const [resHoy, clientes, walkinsHoy] = await Promise.all([
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .is("cancelled_at", null)
        .overlaps("during", `[${todayStart.toISOString()},${tomorrowStart.toISOString()})`),
      supabase
        .from("reservations")
        .select("organizer_id", { count: "exact", head: false })
        .eq("club_id", clubId),
      role === "manager"
        ? supabase
            .from("walkins")
            .select("id", { count: "exact", head: true })
            .eq("club_id", clubId)
            .gte("created_at", todayStart.toISOString())
            .lt("created_at", tomorrowStart.toISOString())
        : Promise.resolve({ count: 0 }),
    ]);

    // Clientes únicos = distinct organizer_id. Como Supabase no expone
    // count(distinct) directo, derivamos en memoria del set retornado.
    const uniqueOrganizers = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (((clientes as any)?.data ?? []) as Array<{ organizer_id: string | null }>)
        .map((r) => r.organizer_id)
        .filter(Boolean) as string[],
    );

    badgeOverrides = {
      "club-reservas": resHoy.count ?? 0,
      "club-clientes": uniqueOrganizers.size,
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

    const [checkins, walkinsHoy] = await Promise.all([
      supabase
        .from("check_ins")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .gte("created_at", todayStart.toISOString())
        .lt("created_at", tomorrowStart.toISOString()),
      supabase
        .from("walkins")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .gte("created_at", todayStart.toISOString())
        .lt("created_at", tomorrowStart.toISOString()),
    ]);
    badgeOverrides = {
      "e-checkin": checkins.count ?? 0,
      "e-walkins": walkinsHoy.count ?? 0,
    };
  }

  // User: clases activas + mensajes no leídos. Sin badge en ranking porque
  // un número suelto sin contexto confunde más que aclara.
  if (role === "user") {
    const userId = session.session.userId;
    const [clases, unread] = await Promise.all([
      supabase
        .from("class_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("student_id", userId)
        .eq("status", "active"),
      // Mensajes no leídos: messages en conversaciones del user, no del propio
      // user, sin entry en message_reads para este user. Aproximación: count
      // total de messages del user en sus conversaciones, le restamos los leídos.
      (async () => {
        const { data: convs } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", userId);
        const convIds = (convs ?? []).map((c) => c.conversation_id as string);
        if (convIds.length === 0) return { count: 0 };
        const { data: msgs } = await supabase
          .from("messages")
          .select("id")
          .in("conversation_id", convIds)
          .neq("sender_id", userId);
        const msgIds = (msgs ?? []).map((m) => m.id as string);
        if (msgIds.length === 0) return { count: 0 };
        const { data: reads } = await supabase
          .from("message_reads")
          .select("message_id")
          .eq("user_id", userId)
          .in("message_id", msgIds);
        const readIds = new Set((reads ?? []).map((r) => r.message_id as string));
        return { count: msgIds.filter((id) => !readIds.has(id)).length };
      })(),
    ]);
    badgeOverrides = {
      "mis-clases": clases.count ?? 0,
      "chat": unread.count,
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
      ? "Plataforma · MatchPoint EC"
      : role === "user"
        ? null
        : role === "partner"
          ? partnerOrg?.name ?? null
          : ownerClub?.name
            ? [ownerClub.name, ownerClub.city].filter(Boolean).join(" · ")
            : null;

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--fg)",
      }}
    >
      <DashboardSidebar
        role={role}
        userName={userName}
        contextLabel={contextLabel}
        badgeOverrides={badgeOverrides}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar role={role} contextLabel={contextLabel} />
        <main
          style={{
            padding: 28,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            flex: 1,
          }}
        >
          {children}
        </main>
      </div>
      {isAdmin && <RoleSwitcher current={role} />}
    </div>
  );
}
