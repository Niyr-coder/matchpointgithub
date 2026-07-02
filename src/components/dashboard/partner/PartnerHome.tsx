// Server: home del partner con KPIs y listas reales.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { formatTournamentFormat } from "@/lib/events/player-event-config";
import { sportLabel } from "@/lib/sports";
import { PartnerHomeView, type PartnerHomeData, type TorneoCard, type MatchItem } from "./PartnerHomeView";

async function loadUserName(): Promise<string | null> {
  const s = await getSession();
  if (!s.authenticated) return null;
  const p = await getProfileSummary(s.session.userId);
  return p.displayName ?? p.username ?? null;
}

const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtDateRange(starts: string, ends: string | null): string {
  const a = new Date(starts);
  if (!ends) return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]}`;
  const b = new Date(ends);
  if (a.getTime() === b.getTime()) return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]}`;
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${a.getDate()}-${b.getDate()} ${MONTHS_SHORT[a.getMonth()]}`;
  }
  return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} - ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`;
}

function effectiveEnd(starts: string, ends: string | null): Date {
  if (ends) return new Date(ends);
  const s = new Date(starts);
  s.setHours(23, 59, 59, 999);
  return s;
}

function fmtUSD(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function fmtCountdown(iso: string, now: Date): string {
  const diff = new Date(iso).getTime() - now.getTime();
  if (diff <= 0) return "ahora";
  const mins = Math.floor(diff / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

const COLORS = ["#10b981", "#0a0a0a", "#0c4a6e", "#7c3aed", "#db2777", "#0ea5e9"];

async function loadData(): Promise<PartnerHomeData> {
  const partnerId = await resolveActivePartnerId();
  const userName = await loadUserName();
  if (!partnerId) {
    return {
      partnerId: null,
      userName,
      kpis: { active: 0, inProgress: 0, upcoming: 0, totalInscritos: 0, deltaInscritos: 0, revenueCents: 0, nextMatchLabel: "—", nextMatchSub: "sin tracking aún" },
      torneos: [],
      matches: [],
    };
  }

  const supabase = await getServerClient();
  const now = new Date();
  const seasonStart = new Date(now.getFullYear(), 0, 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Torneos del partner: activos = no draft/cancelled.
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id,name,sport,format,starts_at,ends_at,max_participants,status,entry_fee_cents")
    .eq("partner_id", partnerId)
    .order("starts_at", { ascending: true });

  const tourIds = (tournaments ?? []).map((t) => t.id as string);

  // Registrations agrupadas por tournament_id.
  const regsByTour = new Map<string, number>();
  const seasonRegs = { total: 0, last30: 0 };
  const monthRevenueByTour = new Map<string, number>();
  let monthRevenueCents = 0;

  if (tourIds.length > 0) {
    const [{ data: registrations }, { data: txns }] = await Promise.all([
      supabase
        .from("registrations")
        .select("tournament_id,status,created_at")
        .in("tournament_id", tourIds)
        .in("status", ["accepted", "pending"]),
      // Fuente única de dinero: v_transactions_net (captured − refunds).
      supabase
        .from("v_transactions_net")
        .select("ref_id,net_amount_cents,created_at")
        .eq("kind", "tournament")
        .eq("status", "captured")
        .in("ref_id", tourIds)
        .gte("created_at", monthStart.toISOString()),
    ]);

    const thirtyAgo = new Date(now);
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    for (const r of registrations ?? []) {
      const tid = r.tournament_id as string;
      regsByTour.set(tid, (regsByTour.get(tid) ?? 0) + 1);
      const at = new Date(r.created_at as string);
      if (at >= seasonStart) seasonRegs.total++;
      if (at >= thirtyAgo) seasonRegs.last30++;
    }
    for (const t of txns ?? []) {
      const tid = t.ref_id as string;
      const cents = (t.net_amount_cents as number) ?? 0;
      monthRevenueByTour.set(tid, (monthRevenueByTour.get(tid) ?? 0) + cents);
      monthRevenueCents += cents;
    }
  }

  // KPIs: active/in_progress/upcoming
  let active = 0;
  let inProgress = 0;
  let upcoming = 0;
  for (const t of tournaments ?? []) {
    const status = t.status as string;
    if (["draft", "cancelled", "completed"].includes(status)) continue;
    active++;
    const starts = new Date(t.starts_at as string);
    const ends = effectiveEnd(t.starts_at as string, (t.ends_at as string | null) ?? null);
    if (starts <= now && now <= ends) inProgress++;
    else if (starts > now) upcoming++;
  }

  // Próximos matches (bracket_matches scheduled) de torneos del partner.
  let matches: MatchItem[] = [];
  let nextMatchLabel = "—";
  let nextMatchSub = "sin tracking aún";
  if (tourIds.length > 0) {
    const { data: brks } = await supabase
      .from("brackets")
      .select("id,tournament_id")
      .in("tournament_id", tourIds);
    const brkIds = (brks ?? []).map((b) => b.id as string);
    const tourNameById = new Map<string, string>();
    for (const t of tournaments ?? []) tourNameById.set(t.id as string, (t.name as string) ?? "—");
    const brkToTour = new Map<string, string>();
    for (const b of brks ?? []) brkToTour.set(b.id as string, b.tournament_id as string);

    if (brkIds.length > 0) {
      const { data: bm } = await supabase
        .from("bracket_matches")
        .select("id,bracket_id,scheduled_at,court_id,status")
        .in("bracket_id", brkIds)
        .gte("scheduled_at", now.toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(3);

      const courtIds = Array.from(new Set((bm ?? []).map((m) => m.court_id as string).filter(Boolean)));
      const courtNameById = new Map<string, string>();
      if (courtIds.length > 0) {
        const { data: courts } = await supabase
          .from("courts")
          .select("id,name,code,club_id,clubs(name)")
          .in("id", courtIds);
        for (const c of courts ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clubName = ((c as any).clubs?.name as string) ?? "Club";
          const code = (c.code as string) ?? (c.name as string) ?? "C?";
          courtNameById.set(c.id as string, `${clubName} · ${code}`);
        }
      }

      matches = (bm ?? []).map((m) => {
        const tid = brkToTour.get(m.bracket_id as string) ?? "";
        return {
          id: m.id as string,
          time: fmtTime(m.scheduled_at as string),
          court: courtNameById.get(m.court_id as string) ?? "—",
          tournament: tourNameById.get(tid) ?? "—",
        };
      });

      if (bm && bm[0]) {
        nextMatchLabel = fmtCountdown(bm[0].scheduled_at as string, now);
        nextMatchSub = tourNameById.get(brkToTour.get(bm[0].bracket_id as string) ?? "") ?? "—";
      }
    }
  }

  // Top torneos para panel (max 3, prioriza in_progress luego upcoming).
  const torneoCards: TorneoCard[] = (tournaments ?? [])
    .filter((t) => !["draft", "cancelled", "completed"].includes(t.status as string))
    .sort((a, b) => {
      const aS = new Date(a.starts_at as string).getTime();
      const aE = effectiveEnd(a.starts_at as string, (a.ends_at as string | null) ?? null).getTime();
      const bS = new Date(b.starts_at as string).getTime();
      const bE = effectiveEnd(b.starts_at as string, (b.ends_at as string | null) ?? null).getTime();
      const aLive = aS <= now.getTime() && now.getTime() <= aE ? 0 : 1;
      const bLive = bS <= now.getTime() && now.getTime() <= bE ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return aS - bS;
    })
    .slice(0, 3)
    .map((t, i) => {
      const starts = new Date(t.starts_at as string);
      const ends = effectiveEnd(t.starts_at as string, (t.ends_at as string | null) ?? null);
      const live = starts <= now && now <= ends;
      const regs = regsByTour.get(t.id as string) ?? 0;
      const cap = (t.max_participants as number | null) ?? 0;
      const rev = monthRevenueByTour.get(t.id as string) ?? 0;
      const sport = sportLabel(String(t.sport ?? ""));
      const formatKey = String(t.format ?? "");
      const format = formatKey ? formatTournamentFormat(formatKey) : "";
      return {
        id: t.id as string,
        n: (t.name as string) ?? "—",
        s: format ? `${sport} · ${format}` : sport,
        date: fmtDateRange(t.starts_at as string, (t.ends_at as string | null) ?? null),
        cupos: cap > 0 ? `${regs} / ${cap}` : `${regs} / —`,
        revenue: fmtUSD(rev),
        live,
        color: COLORS[i % COLORS.length],
      };
    });

  return {
    partnerId,
    userName,
    kpis: {
      active,
      inProgress,
      upcoming,
      totalInscritos: seasonRegs.total,
      deltaInscritos: seasonRegs.last30,
      revenueCents: monthRevenueCents,
      nextMatchLabel,
      nextMatchSub,
    },
    torneos: torneoCards,
    matches,
  };
}

export async function PartnerHome() {
  const data = await loadData();
  return <PartnerHomeView data={data} />;
}
