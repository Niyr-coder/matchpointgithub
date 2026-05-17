// Server: fetch courts del club + pricing + utilización (reservas últimos 7 días).
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { ClubCanchasScreenView, type CanchasData, type CourtCard } from "./ClubCanchasScreenView";

async function loadData(): Promise<CanchasData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return { clubId: null, courts: [] };

  const supabase = await getServerClient();
  const { data: courts } = await supabase
    .from("courts")
    .select("id,code,name,sport,surface,indoor,lights,active,ordinal")
    .eq("club_id", clubId)
    .order("ordinal");

  const courtIds = (courts ?? []).map((c) => c.id as string);
  if (courtIds.length === 0) return { clubId, courts: [] };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [{ data: pricing }, { data: reservations }] = await Promise.all([
    supabase
      .from("court_pricing")
      .select("court_id,price_cents,starts_at,ends_at")
      .in("court_id", courtIds)
      .eq("active", true),
    supabase
      .from("reservations")
      .select("court_id")
      .in("court_id", courtIds)
      .gte("during", weekAgo.toISOString())
      .neq("status", "cancelled"),
  ]);

  // Min price per court.
  const priceByCourt = new Map<string, number>();
  const hoursByCourt = new Map<string, string>();
  for (const p of pricing ?? []) {
    const cId = p.court_id as string;
    const cents = p.price_cents as number;
    if (!priceByCourt.has(cId) || cents < (priceByCourt.get(cId) ?? Infinity)) {
      priceByCourt.set(cId, cents);
    }
    if (!hoursByCourt.has(cId) && p.starts_at && p.ends_at) {
      hoursByCourt.set(cId, `${(p.starts_at as string).slice(0, 5)} – ${(p.ends_at as string).slice(0, 5)}`);
    }
  }

  // Reservation count per court (7 días).
  const resvByCourt = new Map<string, number>();
  for (const r of reservations ?? []) {
    const cId = r.court_id as string;
    resvByCourt.set(cId, (resvByCourt.get(cId) ?? 0) + 1);
  }
  // Utilización: % de slots ocupados (7 días × 16 horas potenciales = 112).
  const SLOTS_WEEK = 7 * 16;

  const courtCards: CourtCard[] = (courts ?? []).map((c) => {
    const surfaceParts = [
      c.indoor ? "Indoor" : "Outdoor",
      c.surface ? (c.surface as string).toLowerCase() : null,
    ].filter(Boolean);
    const minPriceCents = priceByCourt.get(c.id as string) ?? null;
    const hours = hoursByCourt.get(c.id as string) ?? "06:00 – 22:00";
    const resvCount = resvByCourt.get(c.id as string) ?? 0;
    const util = Math.min(100, Math.round((resvCount / SLOTS_WEEK) * 100));
    return {
      id: c.id as string,
      name: (c.code as string) ?? (c.name as string) ?? "Cancha",
      surf: surfaceParts.join(" · "),
      lights: c.lights as boolean,
      active: c.active as boolean,
      priceCents: minPriceCents,
      hours,
      util,
    };
  });

  return { clubId, courts: courtCards };
}

export async function ClubCanchasScreen() {
  const data = await loadData();
  return <ClubCanchasScreenView data={data} />;
}
