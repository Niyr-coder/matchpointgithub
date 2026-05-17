// Server: métricas agregadas de plataforma.
import { getServerClient } from "@/lib/db/client.server";
import { AdminMetricsScreenView, type MetricsData } from "./AdminMetricsScreenView";

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

async function loadData(): Promise<MetricsData> {
  const supabase = await getServerClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thirtyAgo = new Date(now);
  thirtyAgo.setDate(thirtyAgo.getDate() - 29);
  thirtyAgo.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    { count: mauCount },
    { data: dailyReservations },
    { data: txns30 },
    { data: txnsPrev },
    { data: sportReservations },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("reservations")
      .select("organizer_id,created_at")
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("transactions")
      .select("amount_cents,created_at")
      .eq("status", "captured")
      .gte("created_at", thirtyAgo.toISOString()),
    supabase
      .from("transactions")
      .select("amount_cents")
      .eq("status", "captured")
      .gte("created_at", prevMonthStart.toISOString())
      .lt("created_at", monthStart.toISOString()),
    supabase
      .from("reservations")
      .select("sport")
      .gte("created_at", thirtyAgo.toISOString())
      .neq("status", "cancelled"),
  ]);

  // DAU: organizadores únicos hoy
  const dauSet = new Set<string>();
  for (const r of dailyReservations ?? []) dauSet.add(r.organizer_id as string);

  // GMV mes en curso + delta vs mes anterior
  let gmvMonthCents = 0;
  for (const t of txns30 ?? []) {
    const at = new Date(t.created_at as string);
    if (at >= monthStart) gmvMonthCents += (t.amount_cents as number) ?? 0;
  }
  const gmvPrevCents = (txnsPrev ?? []).reduce((s, t) => s + ((t.amount_cents as number) ?? 0), 0);
  const gmvDeltaPct = gmvPrevCents > 0 ? Math.round(((gmvMonthCents - gmvPrevCents) / gmvPrevCents) * 100) : null;

  // Bars 30d
  const bars30 = Array(30).fill(0) as number[];
  for (const t of txns30 ?? []) {
    const d = new Date(t.created_at as string);
    d.setHours(0, 0, 0, 0);
    const idx = Math.floor((d.getTime() - thirtyAgo.getTime()) / 86400000);
    if (idx >= 0 && idx < 30) bars30[idx] += ((t.amount_cents as number) ?? 0) / 100;
  }

  // Top sports
  const sportCounts = new Map<string, number>();
  for (const r of sportReservations ?? []) {
    const s = r.sport as string;
    sportCounts.set(s, (sportCounts.get(s) ?? 0) + 1);
  }
  const totalSports = Array.from(sportCounts.values()).reduce((s, v) => s + v, 0);
  const topSports = Array.from(sportCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([code, count]) => ({
      label: SPORT_LABEL[code] ?? code,
      pct: totalSports > 0 ? Math.round((count / totalSports) * 100) : 0,
      color: SPORT_COLOR[code] ?? "var(--primary)",
    }));

  return {
    kpis: {
      mau: mauCount ?? 0,
      dau: dauSet.size,
      gmvCents: gmvMonthCents,
      gmvDeltaPct,
      takeRatePct: 10.0, // comisión fija MP, no se computa runtime
    },
    bars30,
    topSports,
  };
}

export async function AdminMetricsScreen() {
  const data = await loadData();
  return <AdminMetricsScreenView data={data} />;
}
