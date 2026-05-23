// Server: fetch club activo del owner + stats + eventos + staff.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { OwnerHomeView, type OwnerHomeData } from "./OwnerHomeView";

async function loadData(): Promise<OwnerHomeData> {
  const session = await getSession();
  if (!session.authenticated) {
    return emptyData();
  }
  const userId = session.session.userId;
  const clubId = await resolveActiveClubId({ staffRoles: ["owner", "manager", "admin"] });
  if (!clubId) return emptyData();

  const supabase = await getServerClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const nowIso = new Date().toISOString();

  // Necesito courtIds antes para pricing — fetch courts primero, luego el resto en paralelo.
  const { data: courts } = await supabase
    .from("courts")
    .select("id,code,name")
    .eq("club_id", clubId)
    .eq("active", true)
    .order("ordinal");
  const courtIds = (courts ?? []).map((c) => c.id as string);

  const [
    { data: profile },
    { data: club },
    { data: todayResv },
    { data: weekResv },
    { data: monthResv },
    { data: tournaments },
    { data: staffRoles },
    { data: pricing },
    { data: reviews },
    { data: membershipsActive },
    { data: membershipsPending },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name,username").eq("id", userId).maybeSingle(),
    supabase.from("clubs").select("id,name,city").eq("id", clubId).maybeSingle(),
    supabase
      .from("reservations")
      .select("id,court_id,during,organizer_id,status,kind")
      .eq("club_id", clubId)
      .overlaps(
        "during",
        `[${todayStart.toISOString()},${todayEnd.toISOString()})`,
      )
      .neq("status", "cancelled"),
    supabase
      .from("reservations")
      .select("id,during")
      .eq("club_id", clubId)
      .overlaps(
        "during",
        `[${weekAgo.toISOString()},${new Date().toISOString()})`,
      )
      .neq("status", "cancelled"),
    supabase
      .from("reservations")
      .select("organizer_id")
      .eq("club_id", clubId)
      .gte("created_at", monthAgo.toISOString())
      .neq("status", "cancelled"),
    supabase
      .from("tournaments")
      .select("name,starts_at,format,max_participants")
      .eq("club_id", clubId)
      .gte("starts_at", new Date().toISOString())
      .not("status", "in", "(draft,cancelled)")
      .order("starts_at", { ascending: true })
      .limit(3),
    supabase
      .from("role_assignments")
      .select("user_id,role,profiles(display_name)")
      .eq("club_id", clubId)
      .is("revoked_at", null)
      .neq("user_id", userId)
      .limit(4),
    courtIds.length > 0
      ? supabase
          .from("court_pricing")
          .select("court_id,price_cents")
          .in("court_id", courtIds)
          .eq("active", true)
      : Promise.resolve({ data: [] as { court_id: string; price_cents: number }[] }),
    supabase.from("club_reviews").select("rating").eq("club_id", clubId),
    supabase
      .from("club_memberships")
      .select("id,expires_at", { count: "exact", head: false })
      .eq("club_id", clubId)
      .eq("status", "active")
      .or(`expires_at.gt.${nowIso},expires_at.is.null`),
    supabase
      .from("club_memberships")
      .select("id")
      .eq("club_id", clubId)
      .eq("status", "pending"),
  ]);

  // Revenue hoy: min price activo por cancha; reservas en canchas sin pricing se omiten.
  const todayCount = (todayResv ?? []).length;
  const minPriceByCourt = new Map<string, number>();
  for (const p of (pricing ?? []) as { court_id: string; price_cents: number }[]) {
    const prev = minPriceByCourt.get(p.court_id);
    if (prev == null || p.price_cents < prev) {
      minPriceByCourt.set(p.court_id, p.price_cents);
    }
  }
  let revenueHoy = 0;
  for (const r of todayResv ?? []) {
    const price = minPriceByCourt.get(r.court_id as string);
    if (price != null) revenueHoy += price;
  }

  // Rating club: avg + count.
  const ratingRows = (reviews ?? []) as { rating: number }[];
  const ratingCount = ratingRows.length;
  const ratingAvg =
    ratingCount > 0
      ? ratingRows.reduce((acc, r) => acc + Number(r.rating ?? 0), 0) / ratingCount
      : null;

  // Membresías VIP.
  const membersVipCount = (membershipsActive ?? []).length;
  const membersVipPending = (membershipsPending ?? []).length;

  // Ocupación: cuántas horas reservadas / total horas (cuántas canchas × ~16 horas operación).
  const courtsCount = (courts ?? []).length;
  const totalHoursDay = courtsCount * 16;
  const ocupacionPct = totalHoursDay > 0 ? Math.round((todayCount / totalHoursDay) * 100) : 0;

  // Socios activos: distinct organizers en últimos 30 días.
  const sociosSet = new Set((monthResv ?? []).map((r) => r.organizer_id as string));
  const sociosCount = sociosSet.size;

  // Revenue últimos 7 días: cuento reservas por día.
  const dailyCounts = new Array(7).fill(0);
  for (const r of weekResv ?? []) {
    const d = new Date((r.during as string).match(/^[[(]"?([^",)]+)/)?.[1] ?? r.during as string);
    const diffDays = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
    const idx = 6 - diffDays;
    if (idx >= 0 && idx < 7) dailyCounts[idx] += 1;
  }
  const maxBar = Math.max(...dailyCounts, 1);
  const revenueBars = dailyCounts.map((c) => Math.round((c / maxBar) * 110));
  const revenueWeekTotal = dailyCounts.reduce((a, b) => a + b, 0) * 18;

  // Calendar today: matriz courts × horas (morning → night, evenly spaced).
  const hours = ["08", "10", "12", "14", "16", "18", "20"];
  const calendarCourts = (courts ?? []).slice(0, 4).map((c) => (c.code as string) ?? (c.name as string) ?? "C");
  const cellState: Record<string, "reserved" | "event" | "class" | "free"> = {};
  for (const r of todayResv ?? []) {
    const d = new Date((r.during as string).match(/^[[(]"?([^",)]+)/)?.[1] ?? r.during as string);
    const h = String(d.getHours()).padStart(2, "0");
    if (!hours.includes(h)) continue;
    const courtIdx = (courts ?? []).findIndex((c) => c.id === r.court_id);
    if (courtIdx === -1 || courtIdx >= 4) continue;
    // kind (mig 167): booking → reserved, event → event, class → class.
    const kind = (r.kind as string | null) ?? "booking";
    cellState[`${h}-${courtIdx}`] =
      kind === "event" ? "event" : kind === "class" ? "class" : "reserved";
  }

  // Staff con iniciales.
  const staff = (staffRoles ?? []).map((s) => {
    const profile = s.profiles as { display_name?: string } | null;
    const name = profile?.display_name ?? "Staff";
    return {
      name,
      role: roleLabel(s.role as string),
      online: false, // sin presence todavía
    };
  });

  // Eventos próximos del club.
  const events = (tournaments ?? []).slice(0, 3).map((t) => {
    const d = new Date(t.starts_at as string);
    const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
    return {
      d: String(d.getUTCDate()).padStart(2, "0"),
      m: months[d.getUTCMonth()],
      name: t.name as string,
      sub:
        t.max_participants != null
          ? `Hasta ${t.max_participants} cupos`
          : "Inscripción abierta",
      tag: tagFromFormat(t.format as string),
    };
  });

  return {
    clubId,
    clubName: (club?.name as string) ?? "Tu club",
    clubCity: (club?.city as string | null) ?? null,
    userName:
      (profile?.display_name as string | undefined) ??
      (profile?.username as string | undefined) ??
      null,
    hasClub: true,
    revenueHoyCents: revenueHoy,
    todayCount,
    ocupacionPct,
    sociosCount,
    courtsCount,
    calendarCourts,
    calendarHours: hours,
    cellState,
    revenueBars,
    revenueWeekCents: revenueWeekTotal * 100,
    events,
    staff,
    ratingAvg,
    ratingCount,
    membersVipCount,
    membersVipPending,
  };
}

function emptyData(): OwnerHomeData {
  return {
    clubId: null,
    clubName: "Tu club",
    clubCity: null,
    userName: null,
    hasClub: false,
    revenueHoyCents: 0,
    todayCount: 0,
    ocupacionPct: 0,
    sociosCount: 0,
    courtsCount: 0,
    calendarCourts: ["C1", "C2", "C3", "C4"],
    calendarHours: ["08", "10", "12", "14", "16", "18", "20"],
    cellState: {},
    revenueBars: [0, 0, 0, 0, 0, 0, 0],
    revenueWeekCents: 0,
    events: [],
    staff: [],
    ratingAvg: null,
    ratingCount: 0,
    membersVipCount: 0,
    membersVipPending: 0,
  };
}

function roleLabel(role: string): string {
  switch (role) {
    case "owner": return "Owner";
    case "manager": return "Manager";
    case "coach": return "Coach";
    case "employee": return "Recepción";
    case "partner": return "Partner";
    default: return role;
  }
}

function tagFromFormat(format: string): string {
  if (format === "round_robin" || format === "swiss") return "LIGA";
  if (format === "groups_to_knockout") return "ESTELAR";
  return "TORNEO";
}

export async function OwnerHome() {
  const data = await loadData();
  return <OwnerHomeView data={data} />;
}
