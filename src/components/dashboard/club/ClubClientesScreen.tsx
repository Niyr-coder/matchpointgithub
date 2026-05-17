// Server: socios = distinct organizer_id en reservations del club, con aggregates.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { ClubClientesScreenView, type ClienteRow, type ClientesData } from "./ClubClientesScreenView";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function parseStart(during: string): Date {
  const m = during.match(/^[[(]"?([^",)]+)/);
  return new Date(m ? m[1] : during);
}

function joinedLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function lastVisitLabel(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffDays = Math.floor((now - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "ayer";
  if (diffDays < 7) return `hace ${diffDays} d`;
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} sem`;
  return `hace ${Math.floor(diffDays / 30)} m`;
}

function sportLabel(s: string): string {
  if (s === "tennis") return "Tenis";
  if (s === "padel") return "Pádel";
  return "Pickleball";
}

function tierFor(visits: number): "VIP" | "PRO" | "STD" {
  if (visits >= 30) return "VIP";
  if (visits >= 10) return "PRO";
  return "STD";
}

const AV_GRADIENTS = [
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
];

function initialsOf(name: string): string {
  return name.split(" ").map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
}

async function loadData(): Promise<ClientesData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return { clubId: null, totalSocios: 0, clients: [] };

  const supabase = await getServerClient();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Reservas no canceladas del club, todas (para joined date).
  const { data: allResv } = await supabase
    .from("reservations")
    .select("organizer_id,during,sport,created_at,id")
    .eq("club_id", clubId)
    .neq("status", "cancelled");

  if (!allResv || allResv.length === 0) {
    return { clubId, totalSocios: 0, clients: [] };
  }

  // Aggregate por organizer.
  type Agg = {
    organizerId: string;
    firstAt: string;
    lastVisit: string;
    visits30d: number;
    sportCounts: Record<string, number>;
    resvIds: string[];
  };
  const byOrg = new Map<string, Agg>();
  for (const r of allResv) {
    const orgId = r.organizer_id as string;
    const startStr = (r.during as string);
    const start = parseStart(startStr);
    const createdAt = r.created_at as string;
    const cur =
      byOrg.get(orgId) ??
      ({
        organizerId: orgId,
        firstAt: createdAt,
        lastVisit: start.toISOString(),
        visits30d: 0,
        sportCounts: {},
        resvIds: [],
      } satisfies Agg);
    if (createdAt < cur.firstAt) cur.firstAt = createdAt;
    if (start.toISOString() > cur.lastVisit) cur.lastVisit = start.toISOString();
    if (start.getTime() >= monthAgo.getTime()) cur.visits30d += 1;
    const sp = (r.sport as string) ?? "pickleball";
    cur.sportCounts[sp] = (cur.sportCounts[sp] ?? 0) + 1;
    cur.resvIds.push(r.id as string);
    byOrg.set(orgId, cur);
  }

  const organizerIds = [...byOrg.keys()];

  // Profiles batch.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,display_name")
    .in("id", organizerIds);
  const nameMap = new Map((profiles ?? []).map((p) => [p.id as string, (p.display_name as string) ?? "Socio"]));

  // Spend mes: sumar reservation_payments con status paid en últimos 30d, por organizer.
  const allResvIds = [...byOrg.values()].flatMap((v) => v.resvIds);
  const { data: payments } =
    allResvIds.length > 0
      ? await supabase
          .from("reservation_payments")
          .select("reservation_id,user_id,amount_cents,status,created_at")
          .in("reservation_id", allResvIds)
      : { data: [] };
  const resvToOrg = new Map<string, string>();
  for (const [orgId, agg] of byOrg) {
    for (const rid of agg.resvIds) resvToOrg.set(rid, orgId);
  }
  const spendByOrg = new Map<string, number>();
  for (const p of payments ?? []) {
    // Pagos "completados" = authorized / captured.
    if (p.status !== "captured" && p.status !== "authorized") continue;
    if (new Date(p.created_at as string).getTime() < monthAgo.getTime()) continue;
    const orgId = resvToOrg.get(p.reservation_id as string);
    if (!orgId) continue;
    spendByOrg.set(orgId, (spendByOrg.get(orgId) ?? 0) + (p.amount_cents as number));
  }

  const clients: ClienteRow[] = [...byOrg.values()]
    .map((agg, i) => {
      const sportTop =
        Object.entries(agg.sportCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "pickleball";
      const name = nameMap.get(agg.organizerId) ?? "Socio";
      return {
        id: agg.organizerId,
        name,
        av: initialsOf(name),
        avBg: AV_GRADIENTS[i % AV_GRADIENTS.length],
        tier: tierFor(agg.visits30d),
        joined: joinedLabel(agg.firstAt),
        visits: agg.visits30d,
        spendCents: spendByOrg.get(agg.organizerId) ?? 0,
        lastVisit: lastVisitLabel(agg.lastVisit),
        favSport: sportLabel(sportTop),
      };
    })
    .sort((a, b) => b.visits - a.visits);

  return { clubId, totalSocios: clients.length, clients };
}

export async function ClubClientesScreen() {
  const data = await loadData();
  return <ClubClientesScreenView data={data} />;
}
