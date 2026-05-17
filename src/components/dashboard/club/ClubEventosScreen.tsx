// Server: fetch eventos del club activo con conteo de inscritos + revenue.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
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
  if (dbStatus === "registration_open") return "ABIERTO";
  return "PRÓXIMO";
}

async function loadData(): Promise<EventosData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return { clubId: null, events: [] };

  const supabase = await getServerClient();
  const now = new Date();
  // Mostrar eventos no terminados (draft, published, registration_open/closed, live).
  const { data: events } = await supabase
    .from("events")
    .select("id,name,kind,status,starts_at,capacity,price_cents")
    .eq("club_id", clubId)
    .not("status", "in", "(finished,cancelled)")
    .order("starts_at", { ascending: true });

  const ids = (events ?? []).map((e) => e.id as string);
  const countsById = new Map<string, number>();
  if (ids.length > 0) {
    const { data: regs } = await supabase
      .from("event_registrations")
      .select("event_id")
      .in("event_id", ids)
      .in("status", ["registered", "attended"]);
    for (const r of regs ?? []) {
      const eid = r.event_id as string;
      countsById.set(eid, (countsById.get(eid) ?? 0) + 1);
    }
  }

  const rows: EventRow[] = (events ?? []).map((e) => {
    const starts = new Date(e.starts_at as string);
    const inscCount = countsById.get(e.id as string) ?? 0;
    const cap = (e.capacity as number | null) ?? null;
    const priceCents = (e.price_cents as number) ?? 0;
    return {
      id: e.id as string,
      d: String(starts.getDate()).padStart(2, "0"),
      m: MONTHS_ES[starts.getMonth()],
      n: (e.name as string) ?? "Evento",
      sport: KIND_LABEL[e.kind as string] ?? "Otro",
      insc: `${inscCount}/${cap ?? "∞"}`,
      revenue: `$${Math.round((inscCount * priceCents) / 100)}`,
      st: mapStatus(e.status as string, starts, now),
    };
  });

  return { clubId, events: rows };
}

export async function ClubEventosScreen() {
  const data = await loadData();
  return <ClubEventosScreenView data={data} />;
}
