// Server: eventos + torneos del club activo con conteo de inscritos + revenue.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import {
  listVerifiedPartnersForClub,
  mapPartnerNamesById,
} from "@/server/queries/club-partners";
import { ClubEventosScreenView, type EventosData, type EventRow, type EvStatus } from "./ClubEventosScreenView";

const MONTHS_ES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

const KIND_LABEL: Record<string, string> = {
  social: "Social",
  clinic: "Clínica",
  exhibition: "Exhibición",
  party: "Fiesta",
  league_meet: "Encuentro de liga",
  other: "Otro",
};

function tournamentTypeLabel(format: string): string {
  if (format === "round_robin" || format === "swiss") return "Liga";
  return "Torneo";
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function mapStatus(dbStatus: string, startsAt: Date, now: Date): EvStatus {
  if (dbStatus === "draft") return "BORRADOR";
  if (dbStatus === "live") return "HOY";
  if (sameLocalDay(startsAt, now) && dbStatus !== "finished" && dbStatus !== "cancelled") {
    return "HOY";
  }
  if (dbStatus === "registration_open" || dbStatus === "published") return "ABIERTO";
  return "PRÓXIMO";
}

async function loadData(): Promise<EventosData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return { clubId: null, clubName: null, events: [], verifiedPartners: [] };

  const supabase = await getServerClient();
  const { data: club } = await supabase.from("clubs").select("name").eq("id", clubId).maybeSingle();
  const clubName = (club?.name as string | null) ?? null;
  const now = new Date();

  const [{ data: events }, { data: tournaments }, verifiedPartners] = await Promise.all([
    supabase
      .from("events")
      .select("id,name,kind,status,starts_at,capacity,price_cents")
      .eq("club_id", clubId)
      .not("status", "in", "(finished,cancelled)")
      .order("starts_at", { ascending: true }),
    supabase
      .from("tournaments")
      .select("id,name,format,status,starts_at,max_participants,entry_fee_cents,partner_id")
      .eq("club_id", clubId)
      .not("status", "in", "(finished,cancelled)")
      .order("starts_at", { ascending: true }),
    listVerifiedPartnersForClub(clubId),
  ]);

  const partnerNameById = await mapPartnerNamesById(
    (tournaments ?? [])
      .map((t) => t.partner_id as string | null)
      .filter((id): id is string => !!id),
  );

  const eventIds = (events ?? []).map((e) => e.id as string);
  const tournamentIds = (tournaments ?? []).map((t) => t.id as string);
  const eventCountsById = new Map<string, number>();
  const tournamentCountsById = new Map<string, number>();

  if (eventIds.length > 0) {
    const { data: regs } = await supabase
      .from("event_registrations")
      .select("event_id")
      .in("event_id", eventIds)
      .in("status", ["registered", "attended"]);
    for (const r of regs ?? []) {
      const eid = r.event_id as string;
      eventCountsById.set(eid, (eventCountsById.get(eid) ?? 0) + 1);
    }
  }

  if (tournamentIds.length > 0) {
    const { data: regs } = await supabase
      .from("registrations")
      .select("tournament_id")
      .in("tournament_id", tournamentIds)
      .not("status", "in", "(withdrawn,rejected,cancelled)");
    for (const r of regs ?? []) {
      const tid = r.tournament_id as string;
      tournamentCountsById.set(tid, (tournamentCountsById.get(tid) ?? 0) + 1);
    }
  }

  const eventRows: EventRow[] = (events ?? []).map((e) => {
    const starts = new Date(e.starts_at as string);
    const inscCount = eventCountsById.get(e.id as string) ?? 0;
    const cap = (e.capacity as number | null) ?? null;
    const priceCents = (e.price_cents as number) ?? 0;
    return {
      id: e.id as string,
      kind: "event",
      d: String(starts.getDate()).padStart(2, "0"),
      m: MONTHS_ES[starts.getMonth()],
      n: (e.name as string) ?? "Evento",
      sport: KIND_LABEL[e.kind as string] ?? "Otro",
      insc: `${inscCount}/${cap ?? "∞"}`,
      revenue: `$${Math.round((inscCount * priceCents) / 100)}`,
      st: mapStatus(e.status as string, starts, now),
      startsAt: e.starts_at as string,
    };
  });

  const tournamentRows: EventRow[] = (tournaments ?? []).map((t) => {
    const starts = new Date(t.starts_at as string);
    const inscCount = tournamentCountsById.get(t.id as string) ?? 0;
    const cap = (t.max_participants as number | null) ?? null;
    const feeCents = (t.entry_fee_cents as number) ?? 0;
    const format = (t.format as string) ?? "single_elim";
    const partnerId = (t.partner_id as string | null) ?? null;
    return {
      id: t.id as string,
      kind: "tournament",
      d: String(starts.getDate()).padStart(2, "0"),
      m: MONTHS_ES[starts.getMonth()],
      n: (t.name as string) ?? "Torneo",
      sport: tournamentTypeLabel(format),
      insc: `${inscCount}/${cap ?? "∞"}`,
      revenue: `$${Math.round((inscCount * feeCents) / 100)}`,
      st: mapStatus(t.status as string, starts, now),
      startsAt: t.starts_at as string,
      partnerId,
      partnerName: partnerId ? (partnerNameById.get(partnerId) ?? null) : null,
    };
  });

  const rows = [...eventRows, ...tournamentRows].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );

  return { clubId, clubName, events: rows, verifiedPartners };
}

export async function ClubEventosScreen() {
  const data = await loadData();
  return <ClubEventosScreenView data={data} />;
}
