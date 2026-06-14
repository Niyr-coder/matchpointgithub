// Server: torneos del partner con cupos, premio, revenue del mes.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import {
  PartnerTorneosScreenView,
  type TorneosData,
  type TorneoRow,
  type TorneoStatus,
} from "./PartnerTorneosScreenView";

const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtDateRange(starts: string, ends: string | null): string {
  const a = new Date(starts);
  if (!ends) {
    return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()}`;
  }
  const b = new Date(ends);
  if (a.getTime() === b.getTime()) {
    return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()}`;
  }
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${a.getDate()}-${b.getDate()} ${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()}`;
  }
  return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} - ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
}

const COLORS = ["#10b981", "#0a0a0a", "#0c4a6e", "#7c3aed", "#db2777", "#0ea5e9", "#fbbf24"];

function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

function deriveStatus(dbStatus: string, starts: Date, ends: Date | null, now: Date): TorneoStatus {
  if (dbStatus === "completed" || dbStatus === "cancelled") return "CLOSED";
  const effectiveEnd = ends ?? endOfDay(starts);
  if (starts <= now && now <= effectiveEnd) return "LIVE";
  if (starts <= now && now > effectiveEnd) return "CLOSED";
  // pre-event
  if (dbStatus === "draft") return "CLOSED";
  if (dbStatus === "active" || dbStatus === "registration_open") return "OPEN";
  return "OPEN";
}

async function loadData(): Promise<TorneosData> {
  const partnerId = await resolveActivePartnerId();
  if (!partnerId) return { partnerId: null, rows: [] };

  const supabase = await getServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id,slug,name,sport,format,starts_at,ends_at,status,max_participants,prize_pool_cents")
    .eq("partner_id", partnerId)
    .order("starts_at", { ascending: true });

  const tourIds = (tournaments ?? []).map((t) => t.id as string);
  const regsByTour = new Map<string, number>();
  const revByTour = new Map<string, number>();

  if (tourIds.length > 0) {
    const [{ data: regs }, { data: txns }] = await Promise.all([
      supabase
        .from("registrations")
        .select("tournament_id,status")
        .in("tournament_id", tourIds)
        .in("status", ["accepted", "pending"]),
      supabase
        .from("transactions")
        .select("ref_id,amount_cents")
        .eq("kind", "tournament")
        .eq("status", "captured")
        .in("ref_id", tourIds)
        .gte("created_at", monthStart.toISOString()),
    ]);
    for (const r of regs ?? []) {
      const tid = r.tournament_id as string;
      regsByTour.set(tid, (regsByTour.get(tid) ?? 0) + 1);
    }
    for (const t of txns ?? []) {
      const tid = t.ref_id as string;
      revByTour.set(tid, (revByTour.get(tid) ?? 0) + ((t.amount_cents as number) ?? 0));
    }
  }

  const rows: TorneoRow[] = (tournaments ?? []).map((t, i) => {
    const startsRaw = t.starts_at as string;
    const endsRaw = (t.ends_at as string | null) ?? null;
    const starts = new Date(startsRaw);
    const ends = endsRaw ? new Date(endsRaw) : null;
    const cap = (t.max_participants as number | null) ?? 0;
    const regs = regsByTour.get(t.id as string) ?? 0;
    const prize = (t.prize_pool_cents as number | null) ?? 0;
    const rev = revByTour.get(t.id as string) ?? 0;
    const sportLabel = String(t.sport ?? "—");
    const formatLabel = String(t.format ?? "");
    return {
      id: t.id as string,
      slug: (t.slug as string) ?? (t.id as string),
      n: (t.name as string) ?? "—",
      sport: `${sportLabel}${formatLabel ? ` · ${formatLabel}` : ""}`,
      date: fmtDateRange(startsRaw, endsRaw),
      cupos: cap > 0 ? `${regs} / ${cap}` : `${regs} / —`,
      revenue: `$${Math.round(rev / 100).toLocaleString("en-US")}`,
      prize: prize > 0 ? `$${Math.round(prize / 100).toLocaleString("en-US")}` : "$—",
      st: deriveStatus(t.status as string, starts, ends, now),
      color: COLORS[i % COLORS.length],
      dbStatus: t.status as string,
    };
  });

  return { partnerId, rows };
}

export async function PartnerTorneosScreen() {
  const data = await loadData();
  return <PartnerTorneosScreenView data={data} />;
}
