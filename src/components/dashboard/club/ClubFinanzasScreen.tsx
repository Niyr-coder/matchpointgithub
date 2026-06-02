// Server: data loader del view v2 de Finanzas (ClubFinanzasView). Reemplaza
// los `const` mock con valores reales. Fase 1: KPIs, 30-day stacked, revenue
// por fuente, movimientos hoy, hero payout + waterfall, payouts calendar.
// Mantiene mock (Fase 2/3): ranking por cancha y heatmap $/hora.
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { ClubFinanzasView, type FinanzasData } from "./ClubFinanzasView";

const CAPTURED_STATUSES = ["captured"] as const;

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfPrevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}
function nDaysAgo(d: Date, n: number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - n);
  return x;
}
function fmtHM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function initialsOf(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
// Parsea `tstzrange` retornado por PostgREST en formato `["2026-05-24 16:00:00+00","2026-05-24 17:00:00+00")`
// y devuelve la duración en horas. 0 si no se puede parsear.
function parseDuringHours(during: string | null): number {
  if (!during) return 0;
  const m = during.match(/[[(]"?([^"),]+)"?,"?([^"),]+)"?[)\]]/);
  if (!m) return 0;
  const start = new Date(m[1]);
  const end = new Date(m[2]);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  return Math.max(0, (end.getTime() - start.getTime()) / 3600000);
}

function courtTag(c: { surface: unknown; indoor: unknown }): string {
  const parts: string[] = [];
  parts.push(c.indoor ? "INDOOR" : "OUTDOOR");
  if (typeof c.surface === "string" && c.surface) parts.push(c.surface.toUpperCase());
  return parts.join(" · ");
}

function methodLabel(method: string | null): string {
  switch (method) {
    case "transfer": return "Transferencia";
    case "cash": return "Efectivo · caja";
    case "wallet": return "Saldo MP";
    case "card": return "Tarjeta";
    default: return method ?? "—";
  }
}
const KIND_TO_SOURCE: Record<string, "reservations" | "events" | "classes" | "proshop" | null> = {
  reservation: "reservations",
  event: "events",
  tournament: "events",
  class: "classes",
  proshop_sale: "proshop",
  plan: null,
  club_featuring: null,
  club_membership: null,
};
function kindLabel(kind: string, status: string): string {
  if (status === "refunded") return "Reembolso";
  switch (kind) {
    case "reservation": return "Reserva";
    case "event":
    case "tournament": return "Inscripción";
    case "class": return "Clase";
    case "proshop_sale": return "Pro shop";
    default: return kind;
  }
}

export async function ClubFinanzasScreen() {
  const data = await loadData();
  return <ClubFinanzasView data={data} />;
}

async function loadData(): Promise<FinanzasData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return emptyData(null);

  const supabase = await getServerClient();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfPrevMonth(now);
  const thirtyAgo = nDaysAgo(now, 29);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [
    { data: txMonth },
    { data: txPrev },
    { data: tx30 },
    { data: txToday },
    { data: payouts },
    { data: refundsMonth },
    { count: activeMembers },
    { data: courtsRaw },
    { data: resMonth },
    { data: resTxnsMonth },
    { data: takeRateConfig },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount_cents,kind,status")
      .eq("club_id", clubId)
      .in("status", CAPTURED_STATUSES)
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("transactions")
      .select("amount_cents,kind")
      .eq("club_id", clubId)
      .in("status", CAPTURED_STATUSES)
      .gte("created_at", prevMonthStart.toISOString())
      .lt("created_at", monthStart.toISOString()),
    supabase
      .from("transactions")
      .select("amount_cents,kind,created_at")
      .eq("club_id", clubId)
      .in("status", CAPTURED_STATUSES)
      .gte("created_at", thirtyAgo.toISOString()),
    supabase
      .from("transactions")
      .select("id,amount_cents,kind,status,method,created_at,customer_name,customer_user_id")
      .eq("club_id", clubId)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("payouts")
      .select("id,period_start,period_end,gross_cents,commission_cents,net_cents,status,scheduled_for,paid_at")
      .eq("club_id", clubId)
      .order("scheduled_for", { ascending: true, nullsFirst: false })
      .limit(20),
    supabase
      .from("refunds")
      .select("amount_cents,created_at,transaction_id")
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("club_memberships")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("status", "active"),
    supabase
      .from("courts")
      .select("id,name,ordinal,surface,indoor,active,surface_color")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("ordinal", { ascending: true }),
    supabase
      .from("reservations")
      .select("id,court_id,during")
      .eq("club_id", clubId)
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("transactions")
      .select("amount_cents,ref_id")
      .eq("club_id", clubId)
      .eq("kind", "reservation")
      .in("status", CAPTURED_STATUSES)
      .gte("created_at", monthStart.toISOString())
      .not("ref_id", "is", null),
    getAdminClient()
      .from("platform_config")
      .select("value")
      .eq("key", "take_rate_pct")
      .maybeSingle(),
  ]);
  const takeRatePct =
    typeof takeRateConfig?.value === "number"
      ? takeRateConfig.value
      : Number(takeRateConfig?.value ?? 10);

  // Resolver nombres de customers para las txns de hoy (1 query extra).
  const customerIds = Array.from(
    new Set(
      (txToday ?? [])
        .map((t) => t.customer_user_id as string | null)
        .filter((v): v is string => !!v),
    ),
  );
  const nameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", customerIds);
    for (const p of profs ?? []) {
      nameById.set(p.id as string, (p.display_name as string) ?? "");
    }
  }

  // KPIs base — revenue mes + ticket promedio.
  let revenueGrossCents = 0;
  let txnCount = 0;
  for (const r of txMonth ?? []) {
    revenueGrossCents += (r.amount_cents as number) ?? 0;
    txnCount += 1;
  }
  let revenuePrevCents = 0;
  let txnPrevCount = 0;
  for (const r of txPrev ?? []) {
    revenuePrevCents += (r.amount_cents as number) ?? 0;
    txnPrevCount += 1;
  }
  const ticketAvgCents = txnCount > 0 ? Math.round(revenueGrossCents / txnCount) : 0;
  const ticketPrevCents = txnPrevCount > 0 ? Math.round(revenuePrevCents / txnPrevCount) : 0;

  // Refunds.
  const refundCount = (refundsMonth ?? []).length;
  const refundRatePct =
    txnCount > 0 ? Math.round((refundCount / txnCount) * 1000) / 10 : 0;

  // ARPU socio: revenue mes / socios activos (proxy; ideal sería revenue
  // generado por socios). Si no hay socios queda en 0.
  const activeMembersCount = activeMembers ?? 0;
  const arpuMemberCents =
    activeMembersCount > 0 ? Math.round(revenueGrossCents / activeMembersCount) : 0;

  // 30-day stacked: por día y por bucket de fuente.
  const stack30 = Array.from({ length: 30 }, () => ({
    reservations: 0,
    events: 0,
    classes: 0,
    proshop: 0,
  }));
  for (const r of tx30 ?? []) {
    const d = new Date(r.created_at as string);
    d.setHours(0, 0, 0, 0);
    const idx = Math.floor((d.getTime() - thirtyAgo.getTime()) / 86400000);
    if (idx < 0 || idx >= 30) continue;
    const bucket = KIND_TO_SOURCE[r.kind as string];
    if (!bucket) continue;
    stack30[idx][bucket] += (r.amount_cents as number) ?? 0;
  }
  const monthGross =
    stack30.reduce(
      (s, d) => s + d.reservations + d.events + d.classes + d.proshop,
      0,
    );
  const totalDeltaCents = revenueGrossCents - revenuePrevCents;

  // Sources: agregado por kind en mes + delta vs prev mes.
  const monthByBucket = { reservations: 0, events: 0, classes: 0, proshop: 0 };
  const monthCountByBucket = { reservations: 0, events: 0, classes: 0, proshop: 0 };
  for (const r of txMonth ?? []) {
    const b = KIND_TO_SOURCE[r.kind as string];
    if (!b) continue;
    monthByBucket[b] += (r.amount_cents as number) ?? 0;
    monthCountByBucket[b] += 1;
  }
  const prevByBucket = { reservations: 0, events: 0, classes: 0, proshop: 0 };
  for (const r of txPrev ?? []) {
    const b = KIND_TO_SOURCE[r.kind as string];
    if (!b) continue;
    prevByBucket[b] += (r.amount_cents as number) ?? 0;
  }
  const totalSources =
    monthByBucket.reservations +
    monthByBucket.events +
    monthByBucket.classes +
    monthByBucket.proshop;
  function srcCard(b: "reservations" | "events" | "classes" | "proshop") {
    const cents = monthByBucket[b];
    const prev = prevByBucket[b];
    const deltaPct = prev > 0 ? Math.round(((cents - prev) / prev) * 100) : cents > 0 ? 100 : 0;
    return {
      cents,
      count: monthCountByBucket[b],
      pct: totalSources > 0 ? Math.round((cents / totalSources) * 100) : 0,
      deltaPct,
    };
  }

  // Txns hoy: mapear a la shape del view.
  const txns = (txToday ?? []).map((t) => {
    const customerId = t.customer_user_id as string | null;
    const who =
      (customerId && nameById.get(customerId)) ||
      (t.customer_name as string | null) ||
      "Walk-in";
    const status = (t.status as string) ?? "";
    const isRefund = status === "refunded";
    const isHold = status === "pending_proof" || status === "proof_submitted";
    const amt = (t.amount_cents as number) ?? 0;
    return {
      id: t.id as string,
      timeHM: fmtHM(t.created_at as string),
      who,
      initials: initialsOf(who),
      kind: kindLabel(t.kind as string, status),
      sub: "", // V2 muestra "Cancha Centro · 90 min" — necesita join a ref → reservation. Phase 2.
      amountCents: isRefund ? -Math.abs(amt) : amt,
      method: methodLabel(t.method as string | null),
      status: isRefund ? ("refund" as const) : isHold ? ("hold" as const) : ("ok" as const),
    };
  });

  // Payouts calendar: mapear status DB → estado visual del view.
  const dtfWeekday = new Intl.DateTimeFormat("es-EC", { weekday: "short", day: "2-digit", month: "short" });
  function labelFor(p: { period_start: string | null; period_end: string | null }): string {
    if (!p.period_start) return "Payout";
    const d = new Date(p.period_start);
    const m = new Intl.DateTimeFormat("es-EC", { month: "long" }).format(d).replace(/^\w/, (c) => c.toUpperCase());
    // ISO week-of-month aprox: día/7 + 1.
    const week = Math.floor((d.getDate() - 1) / 7) + 1;
    return `${m} · semana ${week}`;
  }
  function whenFor(p: { scheduled_for: string | null; paid_at: string | null; status: string }): string {
    const ref = p.paid_at ?? p.scheduled_for;
    if (!ref) return "—";
    const d = new Date(ref);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return `hoy ${fmtHM(ref)}`;
    if (diff === 1) return `mañana ${fmtHM(ref)}`;
    if (diff === -1) return `ayer ${fmtHM(ref)}`;
    return dtfWeekday.format(d);
  }
  function statusFor(s: string): "PROGRAMADO" | "PAGADO" | "ESTIMADO" {
    if (s === "paid") return "PAGADO";
    if (s === "scheduled") return "PROGRAMADO";
    return "ESTIMADO";
  }
  const payoutsMapped = (payouts ?? []).map((p) => ({
    id: p.id as string,
    label: labelFor(p as never),
    when: whenFor(p as never),
    netCents: (p.net_cents as number) ?? 0,
    status: statusFor((p.status as string) ?? ""),
  }));
  // Hero payout: próximo `scheduled` o `pending` (no paid). Si no hay,
  // usamos el primero del array. Delta vs el payout anterior (paid_at más
  // reciente).
  const upcoming = (payouts ?? []).find(
    (p) => (p.status as string) === "scheduled" || (p.status as string) === "pending",
  );
  const prevPaid = (payouts ?? [])
    .filter((p) => (p.status as string) === "paid")
    .sort(
      (a, b) =>
        new Date((b.paid_at as string) ?? 0).getTime() -
        new Date((a.paid_at as string) ?? 0).getTime(),
    )[0];

  // Refunds que tocan el período del próximo payout.
  let payoutRefundsCents = 0;
  if (upcoming && upcoming.period_start && upcoming.period_end) {
    const ps = new Date(upcoming.period_start);
    const pe = new Date(upcoming.period_end);
    pe.setHours(23, 59, 59, 999);
    for (const r of refundsMonth ?? []) {
      const cd = new Date(r.created_at as string);
      if (cd >= ps && cd <= pe) {
        payoutRefundsCents += (r.amount_cents as number) ?? 0;
      }
    }
  }

  // ── Ranking por cancha ──
  // Mapear reservation.id → court_id (para luego cruzar con transactions.ref_id)
  const courtByReservation = new Map<string, string>();
  const hoursByCourt = new Map<string, number>();
  const reservationsByCourt = new Map<string, number>();
  for (const r of resMonth ?? []) {
    const rid = r.id as string;
    const cid = r.court_id as string | null;
    if (!cid) continue;
    courtByReservation.set(rid, cid);
    reservationsByCourt.set(cid, (reservationsByCourt.get(cid) ?? 0) + 1);
    hoursByCourt.set(cid, (hoursByCourt.get(cid) ?? 0) + parseDuringHours(r.during as string | null));
  }
  // Sumar revenue por court vía transactions.ref_id
  const revenueByCourt = new Map<string, number>();
  for (const t of resTxnsMonth ?? []) {
    const rid = t.ref_id as string | null;
    if (!rid) continue;
    const cid = courtByReservation.get(rid);
    if (!cid) continue;
    revenueByCourt.set(cid, (revenueByCourt.get(cid) ?? 0) + ((t.amount_cents as number) ?? 0));
  }
  // 12h × 30 días ≈ ventana operativa típica del club. Para ocupación más
  // exacta habría que leer club_settings.open_hours (Fase 3).
  const HOURS_WINDOW = 12 * 30;
  const fallbackColors = ["#0a0a0a", "#fbbf24", "#10b981", "#0c4a6e", "#7c3aed"];
  const courtRanking = (courtsRaw ?? [])
    .map((c, idx) => {
      const id = c.id as string;
      const revenue = revenueByCourt.get(id) ?? 0;
      const count = reservationsByCourt.get(id) ?? 0;
      const hours = hoursByCourt.get(id) ?? 0;
      const occ = Math.min(100, Math.round((hours / HOURS_WINDOW) * 100));
      return {
        id,
        n: (c.ordinal as number) ?? idx + 1,
        t: (c.name as string) ?? "Cancha",
        tag: courtTag(c as never),
        revenueCents: revenue,
        reservationsCount: count,
        avgTicketCents: count > 0 ? Math.round(revenue / count) : 0,
        occ,
        color: (c.surface_color as string) ?? fallbackColors[idx % fallbackColors.length],
      };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 5);

  const nextPayout = upcoming
    ? {
        netCents: (upcoming.net_cents as number) ?? 0,
        scheduledFor: (upcoming.scheduled_for as string | null) ?? null,
        grossCents: (upcoming.gross_cents as number) ?? 0,
        commissionCents: (upcoming.commission_cents as number) ?? 0,
        refundsCents: payoutRefundsCents,
        deltaPct:
          prevPaid && (prevPaid.net_cents as number) > 0
            ? Math.round(
                (((upcoming.net_cents as number) -
                  (prevPaid.net_cents as number)) /
                  (prevPaid.net_cents as number)) *
                  100,
              )
            : 0,
      }
    : null;

  return {
    clubId,
    period: "mes",
    revenueGrossCents,
    revenuePrevCents,
    monthGross,
    totalDeltaCents,
    ticketAvgCents,
    ticketPrevCents,
    arpuMemberCents,
    activeMembersCount,
    refundRatePct,
    refundCount,
    txnCount,
    stack30,
    sources: {
      reservations: srcCard("reservations"),
      events: srcCard("events"),
      classes: srcCard("classes"),
      proshop: srcCard("proshop"),
    },
    txns,
    payouts: payoutsMapped,
    nextPayout,
    courtRanking,
    takeRatePct: Number.isFinite(takeRatePct) ? takeRatePct : 10,
  };
}

function emptyData(clubId: string | null): FinanzasData {
  return {
    clubId,
    period: "mes",
    revenueGrossCents: 0,
    revenuePrevCents: 0,
    monthGross: 0,
    totalDeltaCents: 0,
    ticketAvgCents: 0,
    ticketPrevCents: 0,
    arpuMemberCents: 0,
    activeMembersCount: 0,
    refundRatePct: 0,
    refundCount: 0,
    txnCount: 0,
    stack30: Array.from({ length: 30 }, () => ({
      reservations: 0,
      events: 0,
      classes: 0,
      proshop: 0,
    })),
    sources: {
      reservations: { cents: 0, count: 0, pct: 0, deltaPct: 0 },
      events: { cents: 0, count: 0, pct: 0, deltaPct: 0 },
      classes: { cents: 0, count: 0, pct: 0, deltaPct: 0 },
      proshop: { cents: 0, count: 0, pct: 0, deltaPct: 0 },
    },
    txns: [],
    payouts: [],
    nextPayout: null,
    courtRanking: [],
    takeRatePct: 10,
  };
}
