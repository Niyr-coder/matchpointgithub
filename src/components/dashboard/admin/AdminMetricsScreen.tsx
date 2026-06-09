// Server: métricas agregadas REALES de plataforma → rediseño AdminMetricasView.
// Calcula, por periodo (24h/7d/30d/90d/YTD), KPIs (MAU/DAU/GMV/take rate) con
// delta vs periodo anterior + sparkline, serie GMV (actual + periodo anterior),
// funnel de adquisición (signup → onboarding → primer match → match #5 → MP+),
// heatmap día×hora de actividad (reservas), cohortes de retención reales
// (signups por mes × % activos en semanas N) y breakdowns (top deportes,
// top ciudades por usuarios, top clubes por GMV).
//
// Fuentes: profiles (signup/onboarding/ciudad/plan), reservations (actividad,
// deportes, heatmap, cohortes), transactions captured (GMV, top clubes),
// clubs (nombre/ciudad), platform_config (take rate). Admin RLS permite leer
// cross-tenant (el section solo se monta para admin). Ver docs/product/02-payments.md.
import { unstable_cache } from "next/cache";
import { getAdminClient } from "@/lib/db/client.admin";
import { getTakeRatePct } from "@/server/queries/platform-config";
import { AdminMetricsScreenView, type MetricsData, type PeriodKey } from "./AdminMetricsScreenView";

const SPORT_COLOR: Record<string, string> = {
  pickleball: "var(--primary)",
  padel: "#0a0a0a",
  tennis: "#0ea5e9",
  football: "#fbbf24",
};
const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
  football: "Fútbol",
};

const CITY_COLOR = "var(--primary)";
const CLUB_COLOR = "#fbbf24";

// Cantidad de "buckets" del eje X del GMV por periodo (puntos de la línea).
const PERIOD_BUCKETS: Record<PeriodKey, number> = {
  "24h": 24, // por hora
  "7d": 7, // por día
  "30d": 30, // por día
  "90d": 90, // por día
  ytd: 12, // por mes (hasta 12)
};

// Ventana en días que cubre cada periodo (para delimitar el rango actual).
function periodDays(p: PeriodKey, now: Date): number {
  switch (p) {
    case "24h":
      return 1;
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "ytd": {
      const start = new Date(now.getFullYear(), 0, 1);
      return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000));
    }
  }
}

type Txn = { amount_cents: number; created_at: string; club_id: string | null };
type Resv = { sport: string; created_at: string; organizer_id: string; status: string };
type Prof = { id: string; created_at: string; onboarded_at: string | null; city: string | null; plan_tier: string };

// Suma de GMV (cents) de txns dentro de [from, to).
function gmvBetween(txns: Txn[], from: number, to: number): number {
  let sum = 0;
  for (const t of txns) {
    const at = new Date(t.created_at).getTime();
    if (at >= from && at < to) sum += t.amount_cents ?? 0;
  }
  return sum;
}

// Usuarios activos únicos (organizadores de reservas no canceladas) en [from, to).
function activeUsers(resvs: Resv[], from: number, to: number): Set<string> {
  const s = new Set<string>();
  for (const r of resvs) {
    if (r.status === "cancelled") continue;
    const at = new Date(r.created_at).getTime();
    if (at >= from && at < to) s.add(r.organizer_id);
  }
  return s;
}

// Construye la serie de GMV (en dólares) de un periodo en N buckets.
function gmvSeries(txns: Txn[], p: PeriodKey, now: Date): number[] {
  const buckets = PERIOD_BUCKETS[p];
  const out = Array(buckets).fill(0) as number[];
  const nowMs = now.getTime();
  if (p === "24h") {
    const from = nowMs - 24 * 3600000;
    for (const t of txns) {
      const at = new Date(t.created_at).getTime();
      if (at < from || at >= nowMs) continue;
      const idx = Math.floor((at - from) / 3600000);
      if (idx >= 0 && idx < buckets) out[idx] += (t.amount_cents ?? 0) / 100;
    }
  } else if (p === "ytd") {
    const year = now.getFullYear();
    for (const t of txns) {
      const d = new Date(t.created_at);
      if (d.getFullYear() !== year) continue;
      const idx = d.getMonth();
      if (idx >= 0 && idx < buckets) out[idx] += (t.amount_cents ?? 0) / 100;
    }
  } else {
    const days = periodDays(p, now);
    const startDay = new Date(now);
    startDay.setHours(0, 0, 0, 0);
    startDay.setDate(startDay.getDate() - (days - 1));
    const fromMs = startDay.getTime();
    for (const t of txns) {
      const at = new Date(t.created_at).getTime();
      if (at < fromMs) continue;
      const idx = Math.floor((at - fromMs) / 86400000);
      if (idx >= 0 && idx < buckets) out[idx] += (t.amount_cents ?? 0) / 100;
    }
  }
  return out;
}

// Serie del periodo ANTERIOR (mismo tamaño), desplazada hacia atrás.
function gmvSeriesPrev(txns: Txn[], p: PeriodKey, now: Date): number[] {
  const days = periodDays(p, now);
  const prevNow = new Date(now);
  prevNow.setDate(prevNow.getDate() - days);
  // Para 24h restamos 24h exactas.
  if (p === "24h") {
    const prev = new Date(now.getTime() - 24 * 3600000);
    return gmvSeries(txns, p, prev);
  }
  if (p === "ytd") {
    // Periodo anterior = mismo tramo del año pasado.
    const prevYear = new Date(now);
    prevYear.setFullYear(now.getFullYear() - 1);
    return gmvSeries(txns, p, prevYear);
  }
  return gmvSeries(txns, p, prevNow);
}

function pctDelta(cur: number, prev: number): { delta: number | null; up: boolean } {
  if (prev <= 0) return { delta: null, up: cur >= 0 };
  const d = Math.round(((cur - prev) / prev) * 1000) / 10;
  return { delta: d, up: d >= 0 };
}

// Admin client + unstable_cache: loadData escanea 1 año de txns/reservas y
// todos los profiles/clubs en memoria. Sin cache, cada router.refresh() (p.ej.
// desde realtime en otras pantallas) re-ejecuta el barrido. El section solo
// monta para admin; el userId ya se validó antes en el layout de dashboard.
async function loadDataUncached(): Promise<MetricsData> {
  const supabase = getAdminClient();
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setDate(yearAgo.getDate() - 365);
  const yearAgoIso = yearAgo.toISOString();

  const [{ data: txnsRaw }, { data: resvsRaw }, { data: profsRaw }, { data: clubsRaw }, takeRatePct] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("amount_cents,created_at,club_id")
        .eq("status", "captured")
        .gte("created_at", yearAgoIso),
      supabase
        .from("reservations")
        .select("sport,created_at,organizer_id,status")
        .gte("created_at", yearAgoIso),
      supabase.from("profiles").select("id,created_at,onboarded_at,city,plan_tier"),
      supabase.from("clubs").select("id,name,city"),
      getTakeRatePct(),
    ]);

  const txns = (txnsRaw ?? []) as Txn[];
  const resvs = (resvsRaw ?? []) as Resv[];
  const profs = (profsRaw ?? []) as Prof[];
  const clubName = new Map<string, { name: string; city: string }>();
  for (const c of (clubsRaw ?? []) as { id: string; name: string; city: string }[]) {
    clubName.set(c.id, { name: c.name, city: c.city });
  }

  const nowMs = now.getTime();
  const totalUsers = profs.length;

  // ── KPIs por periodo ──────────────────────────────────────────────
  const periods: PeriodKey[] = ["24h", "7d", "30d", "90d", "ytd"];
  const perPeriod: MetricsData["periods"] = {} as MetricsData["periods"];

  for (const p of periods) {
    const days = periodDays(p, now);
    const winMs = (p === "24h" ? 1 : days) * 86400000;
    const curFrom = nowMs - winMs;
    const prevFrom = nowMs - winMs * 2;

    // GMV actual y anterior.
    const gmvCur = gmvBetween(txns, curFrom, nowMs);
    const gmvPrev = gmvBetween(txns, prevFrom, curFrom);
    const gmvD = pctDelta(gmvCur, gmvPrev);

    // Usuarios activos en el periodo (proxy de MAU/DAU según ventana).
    const auCur = activeUsers(resvs, curFrom, nowMs).size;
    const auPrev = activeUsers(resvs, prevFrom, curFrom).size;
    const auD = pctDelta(auCur, auPrev);

    // DAU = activos en las últimas 24h (fijo, independiente del periodo).
    const dauCur = activeUsers(resvs, nowMs - 86400000, nowMs).size;
    const dauPrev = activeUsers(resvs, nowMs - 2 * 86400000, nowMs - 86400000).size;
    const dauD = pctDelta(dauCur, dauPrev);

    // Series GMV (actual + anterior) en dólares.
    const series = gmvSeries(txns, p, now);
    const seriesPrev = gmvSeriesPrev(txns, p, now);

    // Sparklines: GMV por bucket (actual) sirve para MAU/GMV; usamos series.
    perPeriod[p] = {
      kpis: {
        mau: { value: p === "24h" ? dauCur : auCur, delta: (p === "24h" ? dauD : auD).delta, up: (p === "24h" ? dauD : auD).up },
        dau: { value: dauCur, delta: dauD.delta, up: dauD.up },
        gmvCents: { value: gmvCur, delta: gmvD.delta, up: gmvD.up },
        takeRatePct,
        totalUsers,
      },
      gmvSeries: series,
      gmvSeriesPrev: seriesPrev,
    };
  }

  // ── Funnel de adquisición (real, sobre todos los perfiles) ────────
  // Signup → Onboarding completo → Primer match → Match #5 → MP+ activo.
  const matchesByUser = new Map<string, number>();
  for (const r of resvs) {
    if (r.status === "cancelled") continue;
    matchesByUser.set(r.organizer_id, (matchesByUser.get(r.organizer_id) ?? 0) + 1);
  }
  const signups = totalUsers;
  const onboarded = profs.filter((p) => p.onboarded_at != null).length;
  const firstMatch = profs.filter((p) => (matchesByUser.get(p.id) ?? 0) >= 1).length;
  const fifthMatch = profs.filter((p) => (matchesByUser.get(p.id) ?? 0) >= 5).length;
  const mpPlus = profs.filter((p) => p.plan_tier === "premium").length;
  const funnelBase = signups > 0 ? signups : 1;
  const funnel: MetricsData["funnel"] = [
    { label: "Signup completo", value: signups, pct: 100 },
    { label: "Onboarding completo", value: onboarded, pct: Math.round((onboarded / funnelBase) * 1000) / 10 },
    { label: "Primer match", value: firstMatch, pct: Math.round((firstMatch / funnelBase) * 1000) / 10 },
    { label: "Match #5", value: fifthMatch, pct: Math.round((fifthMatch / funnelBase) * 1000) / 10 },
    { label: "Suscripción MP+", value: mpPlus, pct: Math.round((mpPlus / funnelBase) * 1000) / 10 },
  ];

  // ── Heatmap día×hora (reservas no canceladas, últimos 90 días) ────
  const heatFrom = nowMs - 90 * 86400000;
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of resvs) {
    if (r.status === "cancelled") continue;
    const at = new Date(r.created_at);
    if (at.getTime() < heatFrom) continue;
    // getDay(): 0=Dom..6=Sáb → reindexar a 0=Lun..6=Dom.
    const dow = (at.getDay() + 6) % 7;
    heatmap[dow][at.getHours()] += 1;
  }
  // Pico para el insight (día/hora con más actividad).
  let peakDow = 0;
  let peakHour = 0;
  let peakVal = -1;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (heatmap[d][h] > peakVal) {
        peakVal = heatmap[d][h];
        peakDow = d;
        peakHour = h;
      }
    }
  }

  // ── Cohortes de retención reales (signups por mes × % activos sem N) ──
  // Para cada cohorte (mes de signup), % de usuarios con ≥1 reserva en la
  // semana W después de su signup. Semanas medidas: W0,W1,W2,W4,W8,W12.
  const COHORT_WEEKS = [0, 1, 2, 4, 8, 12];
  const resvsByUser = new Map<string, number[]>();
  for (const r of resvs) {
    if (r.status === "cancelled") continue;
    const arr = resvsByUser.get(r.organizer_id) ?? [];
    arr.push(new Date(r.created_at).getTime());
    resvsByUser.set(r.organizer_id, arr);
  }
  // Últimos 5 meses calendario (incluido el actual), del más nuevo al más viejo.
  const cohortMonths: { y: number; m: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    cohortMonths.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  const MONTH_LABEL = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const cohorts: MetricsData["cohorts"] = cohortMonths.map(({ y, m }) => {
    const cohortUsers = profs.filter((p) => {
      const c = new Date(p.created_at);
      return c.getFullYear() === y && c.getMonth() === m;
    });
    const size = cohortUsers.length;
    const data: (number | null)[] = COHORT_WEEKS.map((w) => {
      // Si la semana W cae en el futuro (cohorte demasiado nueva), null.
      const weekStartOffset = w * 7 * 86400000;
      if (size === 0) return null;
      let anyFuture = false;
      let active = 0;
      for (const u of cohortUsers) {
        const signupMs = new Date(u.created_at).getTime();
        const wFrom = signupMs + weekStartOffset;
        const wTo = wFrom + 7 * 86400000;
        if (wFrom > nowMs) {
          anyFuture = true;
          continue;
        }
        const acts = resvsByUser.get(u.id);
        if (acts && acts.some((t) => t >= wFrom && t < wTo)) active++;
      }
      // W0 siempre 100% si la cohorte existe (signup = activación base).
      if (w === 0) return 100;
      // Si toda la cohorte aún no alcanza esa semana, marcar null (—).
      if (anyFuture && active === 0) return null;
      return Math.round((active / size) * 100);
    });
    return { label: MONTH_LABEL[m], size, data };
  });

  // ── Breakdowns (sobre últimos 30 días para deportes/clubes; MAU=ciudades) ──
  const thirtyFrom = nowMs - 30 * 86400000;
  // Top deportes (reservas no canceladas, 30d).
  const sportCounts = new Map<string, number>();
  for (const r of resvs) {
    if (r.status === "cancelled") continue;
    if (new Date(r.created_at).getTime() < thirtyFrom) continue;
    sportCounts.set(r.sport, (sportCounts.get(r.sport) ?? 0) + 1);
  }
  const totalSports = Array.from(sportCounts.values()).reduce((s, v) => s + v, 0);
  const topSports = Array.from(sportCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([code, count]) => ({
      label: SPORT_LABEL[code] ?? code,
      value: `${totalSports > 0 ? Math.round((count / totalSports) * 100) : 0}%`,
      pct: totalSports > 0 ? Math.round((count / totalSports) * 100) : 0,
      color: SPORT_COLOR[code] ?? "var(--primary)",
    }));

  // Top ciudades por usuarios (profiles.city).
  const cityCounts = new Map<string, number>();
  for (const p of profs) {
    const c = (p.city ?? "").trim();
    if (!c) continue;
    cityCounts.set(c, (cityCounts.get(c) ?? 0) + 1);
  }
  const cityRanked = Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const cityMax = cityRanked[0]?.[1] ?? 1;
  const topCities = cityRanked.map(([city, count]) => ({
    label: city,
    value: count.toLocaleString("en-US"),
    pct: Math.round((count / cityMax) * 100),
    color: CITY_COLOR,
  }));

  // Top clubes por GMV (transactions captured con club_id, todo el año).
  const clubGmv = new Map<string, number>();
  for (const t of txns) {
    if (!t.club_id) continue;
    clubGmv.set(t.club_id, (clubGmv.get(t.club_id) ?? 0) + (t.amount_cents ?? 0));
  }
  const clubRanked = Array.from(clubGmv.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const clubMax = clubRanked[0]?.[1] ?? 1;
  const topClubs = clubRanked.map(([id, cents]) => {
    const dollars = cents / 100;
    const v = dollars >= 1000 ? `$${(dollars / 1000).toFixed(1)}k` : `$${Math.round(dollars)}`;
    return {
      label: clubName.get(id)?.name ?? "Club",
      value: v,
      pct: Math.round((cents / clubMax) * 100),
      color: CLUB_COLOR,
    };
  });

  return {
    generatedAt: now.toISOString(),
    periods: perPeriod,
    funnel,
    heatmap,
    heatPeak: { dow: peakDow, hour: peakHour },
    cohorts,
    cohortWeeks: COHORT_WEEKS,
    topSports,
    topCities,
    topClubs,
  };
}

const loadDataCached = unstable_cache(loadDataUncached, ["admin:platform-metrics"], {
  tags: ["admin:metrics"],
  revalidate: 600,
});

export async function AdminMetricsScreen() {
  const data = await loadDataCached();
  return <AdminMetricsScreenView data={data} />;
}
