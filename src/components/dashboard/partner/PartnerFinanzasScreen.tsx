// Server: finanzas del partner — revenue mensual, breakdown, payouts, top torneos.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import {
  PartnerFinanzasScreenView,
  type FinanzasData,
  type RevenueRow,
} from "./PartnerFinanzasScreenView";

const MP_FEE_PCT = 10; // comisión MatchPoint fija

const COLORS = ["#0a0a0a", "var(--primary)", "#0c4a6e", "#7c3aed", "#db2777", "#0ea5e9"];

async function loadData(): Promise<FinanzasData> {
  const partnerId = await resolveActivePartnerId();
  if (!partnerId) {
    return {
      partnerId: null,
      monthRevenueCents: 0,
      mpFeeCents: 0,
      clubsShareCents: 0,
      netCents: 0,
      deltaPct: null,
      ticketAvgCents: null,
      inscritosMonth: 0,
      inscritosDelta: 0,
      activeTournaments: 0,
      revenueByTournament: [],
    };
  }

  const supabase = await getServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyAgo = new Date(now);
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);

  // Torneos del partner
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id,name,status,starts_at,ends_at")
    .eq("partner_id", partnerId);

  const tourIds = (tournaments ?? []).map((t) => t.id as string);
  const tourNameById = new Map<string, string>();
  const tourLiveById = new Map<string, boolean>();
  for (const t of tournaments ?? []) {
    tourNameById.set(t.id as string, (t.name as string) ?? "—");
    const s = new Date(t.starts_at as string);
    const e = new Date(t.ends_at as string);
    tourLiveById.set(t.id as string, s <= now && now <= e);
  }
  const activeTournaments = (tournaments ?? []).filter(
    (t) => !["draft", "cancelled", "completed"].includes(t.status as string),
  ).length;

  let monthRevenueCents = 0;
  let prevRevenueCents = 0;
  let inscritosMonth = 0;
  let inscritosPrev = 0;
  const revByTour = new Map<string, number>();
  const clubsShareByTour = new Map<string, number>();

  if (tourIds.length > 0) {
    const [{ data: txnsMonth }, { data: txnsPrev }, { data: regsMonth }, { data: regsPrev }, { data: links }] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("ref_id,amount_cents,club_id")
          .eq("kind", "tournament")
          .eq("status", "captured")
          .in("ref_id", tourIds)
          .gte("created_at", monthStart.toISOString()),
        supabase
          .from("transactions")
          .select("amount_cents")
          .eq("kind", "tournament")
          .eq("status", "captured")
          .in("ref_id", tourIds)
          .gte("created_at", prevMonthStart.toISOString())
          .lt("created_at", monthStart.toISOString()),
        supabase
          .from("registrations")
          .select("tournament_id,created_at")
          .in("tournament_id", tourIds)
          .gte("created_at", monthStart.toISOString()),
        supabase
          .from("registrations")
          .select("tournament_id,created_at")
          .in("tournament_id", tourIds)
          .gte("created_at", prevMonthStart.toISOString())
          .lt("created_at", monthStart.toISOString()),
        supabase
          .from("partner_club_links")
          .select("club_id,revenue_share_pct")
          .eq("partner_id", partnerId),
      ]);

    const shareByClub = new Map<string, number>();
    for (const l of links ?? []) {
      shareByClub.set(l.club_id as string, Number(l.revenue_share_pct ?? 0));
    }

    for (const t of txnsMonth ?? []) {
      const cents = (t.amount_cents as number) ?? 0;
      monthRevenueCents += cents;
      const tid = t.ref_id as string;
      revByTour.set(tid, (revByTour.get(tid) ?? 0) + cents);
      const cid = t.club_id as string | null;
      if (cid) {
        const pct = shareByClub.get(cid) ?? 0;
        const share = Math.round((cents * pct) / 100);
        clubsShareByTour.set(tid, (clubsShareByTour.get(tid) ?? 0) + share);
      }
    }
    prevRevenueCents = (txnsPrev ?? []).reduce((s, t) => s + ((t.amount_cents as number) ?? 0), 0);
    inscritosMonth = (regsMonth ?? []).length;
    inscritosPrev = (regsPrev ?? []).length;
  }

  const mpFeeCents = Math.round((monthRevenueCents * MP_FEE_PCT) / 100);
  const clubsShareCents = Array.from(clubsShareByTour.values()).reduce((s, v) => s + v, 0);
  const netCents = monthRevenueCents - mpFeeCents - clubsShareCents;
  const deltaPct =
    prevRevenueCents > 0
      ? Math.round(((monthRevenueCents - prevRevenueCents) / prevRevenueCents) * 100)
      : null;
  const ticketAvgCents = inscritosMonth > 0 ? Math.round(monthRevenueCents / inscritosMonth) : null;
  const inscritosDelta = inscritosMonth - inscritosPrev;

  // Top torneos por revenue
  const entries = Array.from(revByTour.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const revenueByTournament: RevenueRow[] = entries.map(([tid, cents], i) => ({
    id: tid,
    n: tourNameById.get(tid) ?? "—",
    v: `$${Math.round(cents / 100).toLocaleString("en-US")}`,
    p: monthRevenueCents > 0 ? Math.round((cents / monthRevenueCents) * 100) : 0,
    c: COLORS[i % COLORS.length],
    live: tourLiveById.get(tid) ?? false,
  }));

  return {
    partnerId,
    monthRevenueCents,
    mpFeeCents,
    clubsShareCents,
    netCents,
    deltaPct,
    ticketAvgCents,
    inscritosMonth,
    inscritosDelta,
    activeTournaments,
    revenueByTournament,
  };
}

export async function PartnerFinanzasScreen() {
  const data = await loadData();
  return <PartnerFinanzasScreenView data={data} />;
}
