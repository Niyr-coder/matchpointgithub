// Server: fetch courts del club + pricing + utilización (7d) + actividad de hoy.
// Mig 168 agrega cols visuales (surface_color/lines_color/line_style/stroke_width)
// + ventana de mantenimiento (maintenance_reason/maintenance_until).
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { ClubCanchasScreenView, type CanchasData, type CourtCard } from "./ClubCanchasScreenView";

async function loadData(): Promise<CanchasData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return { clubId: null, courts: [] };

  const supabase = await getServerClient();
  const { data: courts } = await supabase
    .from("courts")
    .select(
      "id,code,name,sport,surface,indoor,lights,active,ordinal,surface_color,lines_color,line_style,stroke_width,maintenance_reason,maintenance_until",
    )
    .eq("club_id", clubId)
    .order("ordinal");

  const courtIds = (courts ?? []).map((c) => c.id as string);
  if (courtIds.length === 0) return { clubId, courts: [] };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    { data: pricing },
    { data: weekResv },
    { data: todayResv },
    { data: maintLog },
  ] = await Promise.all([
    supabase
      .from("court_pricing")
      .select("court_id,price_cents,starts_at,ends_at")
      .in("court_id", courtIds)
      .eq("active", true),
    supabase
      .from("reservations")
      .select("court_id")
      .in("court_id", courtIds)
      .overlaps(
        "during",
        `[${weekAgo.toISOString()},${new Date().toISOString()})`,
      )
      .neq("status", "cancelled"),
    supabase
      .from("reservations")
      .select(
        "id,court_id,during,kind,organizer_id,notes,profiles!reservations_organizer_id_fkey(display_name)",
      )
      .in("court_id", courtIds)
      .overlaps(
        "during",
        `[${todayStart.toISOString()},${todayEnd.toISOString()})`,
      )
      .neq("status", "cancelled"),
    supabase
      .from("court_maintenance_log")
      .select("id,court_id,reason,starts_at,expected_until,ended_at")
      .in("court_id", courtIds)
      .order("starts_at", { ascending: false })
      .limit(40),
  ]);

  // Min price por cancha.
  const priceByCourt = new Map<string, number>();
  const hoursByCourt = new Map<string, string>();
  for (const p of pricing ?? []) {
    const cId = p.court_id as string;
    const cents = p.price_cents as number;
    if (!priceByCourt.has(cId) || cents < (priceByCourt.get(cId) ?? Infinity)) {
      priceByCourt.set(cId, cents);
    }
    if (!hoursByCourt.has(cId) && p.starts_at && p.ends_at) {
      hoursByCourt.set(cId, `${(p.starts_at as string).slice(0, 5)} – ${(p.ends_at as string).slice(0, 5)}`);
    }
  }

  // Utilización 7d.
  const resvByCourt = new Map<string, number>();
  for (const r of weekResv ?? []) {
    const cId = r.court_id as string;
    resvByCourt.set(cId, (resvByCourt.get(cId) ?? 0) + 1);
  }
  const SLOTS_WEEK = 7 * 16;

  // Today: parse cada reserva (tstzrange "[start,end)"), agrupar por court.
  // Extraer start + end y nombre del organizer para "now playing" / "next" +
  // lista completa de slots para la agenda del drawer.
  type TodaySlot = {
    id: string;
    startMs: number;
    endMs: number;
    kind: string;
    who: string;
    notes: string | null;
  };
  const todayByCourt = new Map<string, TodaySlot[]>();
  for (const r of todayResv ?? []) {
    const cId = r.court_id as string;
    const raw = r.during as string;
    // tstzrange formato: "[\"YYYY-MM-DD HH:MM:SS+00\",\"...\"]" — extraemos los 2 timestamps.
    const m = raw.match(/^[[(]"?([^",)]+)"?,"?([^",)]+)"?[\])]/);
    if (!m) continue;
    const startMs = new Date(m[1]).getTime();
    const endMs = new Date(m[2]).getTime();
    const profile = r.profiles as { display_name?: string } | null;
    const who = profile?.display_name ?? "Reserva";
    const kind = ((r.kind as string | null) ?? "booking");
    const arr = todayByCourt.get(cId) ?? [];
    arr.push({
      id: r.id as string,
      startMs,
      endMs,
      kind,
      who,
      notes: (r.notes as string | null) ?? null,
    });
    todayByCourt.set(cId, arr);
  }
  const nowMs = Date.now();

  // Maintenance log per court (mig 169).
  type MaintLogRow = {
    id: string;
    reason: string | null;
    startsAt: string;
    expectedUntil: string | null;
    endedAt: string | null;
  };
  const maintByCourt = new Map<string, MaintLogRow[]>();
  for (const m of (maintLog ?? []) as Array<{
    id: string;
    court_id: string;
    reason: string | null;
    starts_at: string;
    expected_until: string | null;
    ended_at: string | null;
  }>) {
    const arr = maintByCourt.get(m.court_id) ?? [];
    arr.push({
      id: m.id,
      reason: m.reason,
      startsAt: m.starts_at,
      expectedUntil: m.expected_until,
      endedAt: m.ended_at,
    });
    maintByCourt.set(m.court_id, arr);
  }

  const courtCards: CourtCard[] = (courts ?? []).map((c) => {
    const surfaceParts = [
      c.indoor ? "Indoor" : "Outdoor",
      c.surface ? (c.surface as string).toLowerCase() : null,
    ].filter(Boolean);
    const minPriceCents = priceByCourt.get(c.id as string) ?? null;
    const hours = hoursByCourt.get(c.id as string) ?? "06:00 – 22:00";
    const resvCount = resvByCourt.get(c.id as string) ?? 0;
    const util = Math.min(100, Math.round((resvCount / SLOTS_WEEK) * 100));
    const todaySlots = (todayByCourt.get(c.id as string) ?? []).sort((a, b) => a.startMs - b.startMs);
    const nowSlot = todaySlots.find((s) => s.startMs <= nowMs && nowMs < s.endMs) ?? null;
    const nextSlot = todaySlots.find((s) => s.startMs > nowMs) ?? null;
    const bookingsToday = todaySlots.length;
    const revenueTodayCents =
      minPriceCents != null ? bookingsToday * minPriceCents : 0;
    const isActive = c.active as boolean;
    const isMaintenance = !isActive && (c.maintenance_reason || c.maintenance_until);
    // Status derivado: maintenance (con razón / until) > closed (active=false sin razón)
    // > busy (nowSlot) > free.
    let status: CourtCard["status"];
    if (isMaintenance) status = "maintenance";
    else if (!isActive) status = "closed";
    else if (nowSlot) status = "busy";
    else status = "free";
    return {
      id: c.id as string,
      name: (c.code as string) ?? (c.name as string) ?? "Cancha",
      sport: c.sport as "pickleball" | "padel" | "tennis",
      surf: surfaceParts.join(" · "),
      lights: c.lights as boolean,
      active: isActive,
      priceCents: minPriceCents,
      hours,
      util,
      status,
      surfaceColor: (c.surface_color as string) ?? "#10b981",
      linesColor: (c.lines_color as string) ?? "#ffffff",
      lineStyle: (c.line_style as string) ?? "classic",
      strokeWidth: (c.stroke_width as number) ?? 3,
      maintenanceReason: (c.maintenance_reason as string | null) ?? null,
      maintenanceUntil: (c.maintenance_until as string | null) ?? null,
      bookingsToday,
      revenueTodayCents,
      nowPlaying: nowSlot
        ? {
            who: nowSlot.who,
            startMs: nowSlot.startMs,
            endMs: nowSlot.endMs,
            kind: nowSlot.kind,
          }
        : null,
      nextSlot: nextSlot
        ? {
            who: nextSlot.who,
            startMs: nextSlot.startMs,
            kind: nextSlot.kind,
          }
        : null,
      // Drawer: todos los slots de hoy ordenados + log de mantenimientos.
      todaySlots: todaySlots.map((s) => ({
        id: s.id,
        startMs: s.startMs,
        endMs: s.endMs,
        kind: s.kind,
        who: s.who,
        notes: s.notes,
      })),
      maintenanceLog: maintByCourt.get(c.id as string) ?? [],
    };
  });

  return { clubId, courts: courtCards };
}

export async function ClubCanchasScreen() {
  const data = await loadData();
  return <ClubCanchasScreenView data={data} />;
}
