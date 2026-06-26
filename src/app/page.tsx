// Renderiza siempre con datos frescos; el landing depende del estado vivo de
// clubes/torneos publicados.
export const dynamic = "force-dynamic";

import { LandingShell } from "@/components/landing/LandingShell";
import { listFeaturedClubs } from "@/server/actions/clubs";
import { listFeaturedTournaments } from "@/server/actions/tournaments";
import { getServerClient } from "@/lib/db/client.server";
import type { ClubFeatured } from "@/lib/schemas/clubs";
import type { TournamentFeatured } from "@/lib/schemas/tournaments";

const CARD_GRADIENTS = [
  "linear-gradient(135deg,#064e3b,#10b981)",
  "linear-gradient(135deg,#7c2d12,#fb923c)",
  "linear-gradient(135deg,#1e3a8a,#0ea5e9)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#581c87,#a855f7)",
  "linear-gradient(135deg,#7f1d1d,#ef4444)",
];

const EVENT_GRADIENTS = [
  "linear-gradient(135deg,#064e3b,#10b981)",
  "linear-gradient(135deg,#1e3a8a,#3b82f6)",
  "linear-gradient(135deg,#7c2d12,#dc2626)",
];

const MONTHS_ES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

function formatPrice(cents: number | null): number | null {
  if (cents == null) return null;
  return Math.round(cents / 100);
}

function formatMoney(cents: number | null): string {
  if (cents == null || cents === 0) return "—";
  const n = Math.round(cents / 100);
  return n >= 1000 ? `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `$${n}`;
}

function tournamentTag(format: string): string {
  if (format === "round_robin" || format === "swiss") return "LIGA";
  if (format === "groups_to_knockout") return "ESTELAR";
  return "TORNEO";
}

function eventDateLabel(startsAt: string, endsAt: string | null): { d: string; m: string } {
  const s = new Date(startsAt);
  const e = endsAt ? new Date(endsAt) : s;
  const sd = s.getUTCDate();
  const ed = e.getUTCDate();
  const sameMonth = s.getUTCMonth() === e.getUTCMonth();
  const m = MONTHS_ES[s.getUTCMonth()];
  const d = sameMonth && sd !== ed ? `${sd}-${ed}` : `${sd}`;
  return { d, m };
}

function adaptClubs(rows: ClubFeatured[], ratingByClub: Map<string, number>) {
  return rows.map((c, i) => ({
    n: c.name,
    slug: c.slug,
    city: c.city,
    rating: ratingByClub.get(c.id) ?? 0,
    courts: c.courtsCount,
    price: formatPrice(c.minPriceCents) ?? 0,
    color: CARD_GRADIENTS[i % CARD_GRADIENTS.length],
  }));
}

function adaptTournaments(rows: TournamentFeatured[]) {
  return rows.map((t, i) => {
    const { d, m } = eventDateLabel(t.startsAt, t.endsAt);
    const insc =
      t.maxParticipants != null
        ? `${t.registrationsCount} / ${t.maxParticipants}`
        : `${t.registrationsCount}`;
    const club = [t.clubName, t.clubCity].filter(Boolean).join(" · ") || "Multi-club";
    return {
      slug: t.slug,
      d,
      m,
      n: t.name,
      club,
      prize: formatMoney(t.prizePoolCents),
      insc,
      tag: tournamentTag(t.format),
      color: EVENT_GRADIENTS[i % EVENT_GRADIENTS.length],
    };
  });
}

// House promos — slots propios que cubren cuando faltan datos reales.
const CLUB_PROMOS = [
  {
    n: "Tu club aquí",
    slug: "soy-club",
    city: "Onboarding en 48 horas · sin costo",
    rating: 0,
    courts: 0,
    price: 0,
    color: "linear-gradient(135deg,#0a0a0a,#1f1f23)",
    href: "/soy-club",
    promo: { ctaLabel: "Registra tu club" },
  },
  {
    n: "Invita a tus amigos",
    slug: "signup",
    city: "Más jugadores · mejores partidos",
    rating: 0,
    courts: 0,
    price: 0,
    color: "linear-gradient(135deg,#064e3b,#10b981)",
    href: "/?auth=signup",
    promo: { ctaLabel: "Comparte MATCHPOINT" },
  },
];

const EVENT_PROMOS = [
  {
    n: "Crea tu torneo",
    slug: "soy-club",
    d: "+",
    m: "NEW",
    club: "Para clubes y partners",
    prize: "",
    insc: "",
    tag: "MATCHPOINT",
    color: "linear-gradient(135deg,#0a0a0a,#1f1f23)",
    href: "/soy-club",
    promo: { ctaLabel: "Publica tu torneo" },
  },
  {
    n: "Únete al ranking",
    slug: "signup",
    d: "MP",
    m: "2.5+",
    club: "Empieza a sumar puntos hoy",
    prize: "",
    insc: "",
    tag: "RANKING",
    color: "linear-gradient(135deg,#7c2d12,#fb923c)",
    href: "/?auth=signup",
    promo: { ctaLabel: "Crea tu cuenta" },
  },
];

const TARGET_CLUBS = 4;
const TARGET_EVENTS = 3;

function fillSlots<T>(real: T[], promos: T[], target: number): T[] {
  if (real.length >= target) return real.slice(0, target);
  const need = target - real.length;
  return [...real, ...promos.slice(0, need)];
}

type LandingStats = {
  players: string;
  clubs: string;
  gmv: string;
  rating: string;
};

async function loadLandingExtras(): Promise<{
  stats: LandingStats;
  marqueeClubs: string[];
  ratingByClub: Map<string, number>;
}> {
  const supabase = await getServerClient();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();

  const [
    { count: playersCount },
    { count: clubsActiveCount },
    { data: gmvRows },
    { data: ratingRows },
    { data: clubNames },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("clubs")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("transactions")
      .select("amount_cents")
      .eq("status", "captured")
      .gte("created_at", yearStart),
    supabase.from("club_reviews").select("club_id,rating"),
    supabase
      .from("clubs_public_summary")
      .select("name")
      .order("courts_count", { ascending: false })
      .limit(12),
  ]);

  const gmvCents = (gmvRows ?? []).reduce(
    (s, r) => s + ((r.amount_cents as number) ?? 0),
    0,
  );
  const gmvDollars = Math.round(gmvCents / 100);
  const gmvLabel =
    gmvDollars >= 1000 ? `$${(gmvDollars / 1000).toFixed(0)}k` : `$${gmvDollars.toLocaleString("en-US")}`;

  const sumByClub = new Map<string, { total: number; count: number }>();
  for (const r of ratingRows ?? []) {
    const id = r.club_id as string;
    const cur = sumByClub.get(id) ?? { total: 0, count: 0 };
    cur.total += (r.rating as number) ?? 0;
    cur.count += 1;
    sumByClub.set(id, cur);
  }
  const ratingByClub = new Map<string, number>();
  let globalTotal = 0;
  let globalCount = 0;
  for (const [id, agg] of sumByClub) {
    const avg = agg.total / agg.count;
    ratingByClub.set(id, Math.round(avg * 10) / 10);
    globalTotal += agg.total;
    globalCount += agg.count;
  }
  const globalAvg = globalCount > 0 ? Math.round((globalTotal / globalCount) * 10) / 10 : null;

  return {
    stats: {
      players: (playersCount ?? 0).toLocaleString("en-US"),
      clubs: String(clubsActiveCount ?? 0),
      gmv: gmvCents > 0 ? gmvLabel : "—",
      rating: globalAvg != null ? `${globalAvg.toFixed(1)} ★` : "—",
    },
    marqueeClubs: (clubNames ?? []).map((c) => c.name as string),
    ratingByClub,
  };
}

export default async function HomePage() {
  const [clubsRes, eventsRes, extras] = await Promise.all([
    listFeaturedClubs({ limit: TARGET_CLUBS }),
    listFeaturedTournaments({ limit: TARGET_EVENTS }),
    loadLandingExtras(),
  ]);
  const realClubs = clubsRes.ok ? adaptClubs(clubsRes.data, extras.ratingByClub) : [];
  const realEvents = eventsRes.ok ? adaptTournaments(eventsRes.data) : [];
  const clubs = fillSlots(realClubs, CLUB_PROMOS, TARGET_CLUBS);
  const events = fillSlots(realEvents, EVENT_PROMOS, TARGET_EVENTS);
  return (
    <LandingShell
      clubs={clubs}
      events={events}
      stats={extras.stats}
      marqueeClubs={extras.marqueeClubs}
    />
  );
}
