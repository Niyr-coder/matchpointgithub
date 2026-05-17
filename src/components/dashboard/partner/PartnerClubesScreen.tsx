// Server: clubes asociados del partner via partner_club_links.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import {
  PartnerClubesScreenView,
  type ClubesData,
  type ClubRow,
} from "./PartnerClubesScreenView";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtSince(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

async function loadData(): Promise<ClubesData> {
  const partnerId = await resolveActivePartnerId();
  if (!partnerId) return { partnerId: null, rows: [] };

  const supabase = await getServerClient();
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const { data: links } = await supabase
    .from("partner_club_links")
    .select("club_id,linked_at,clubs(id,name,city)")
    .eq("partner_id", partnerId);

  const clubIds = (links ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((l) => (l as any).club_id as string)
    .filter(Boolean);

  // Eventos del año por club: tournaments hosted en este club por este partner.
  const eventsByClub = new Map<string, number>();
  const revByClub = new Map<string, number>();
  if (clubIds.length > 0) {
    const { data: tours } = await supabase
      .from("tournaments")
      .select("id,club_id")
      .eq("partner_id", partnerId)
      .in("club_id", clubIds)
      .gte("starts_at", yearStart.toISOString());
    const tourToClub = new Map<string, string>();
    for (const t of tours ?? []) {
      const cid = t.club_id as string | null;
      if (!cid) continue;
      tourToClub.set(t.id as string, cid);
      eventsByClub.set(cid, (eventsByClub.get(cid) ?? 0) + 1);
    }
    const tourIds = Array.from(tourToClub.keys());
    if (tourIds.length > 0) {
      const { data: txns } = await supabase
        .from("transactions")
        .select("ref_id,amount_cents,club_id")
        .eq("kind", "tournament")
        .eq("status", "captured")
        .in("ref_id", tourIds)
        .gte("created_at", yearStart.toISOString());
      for (const t of txns ?? []) {
        const cid = (t.club_id as string) ?? tourToClub.get(t.ref_id as string) ?? "";
        if (!cid) continue;
        revByClub.set(cid, (revByClub.get(cid) ?? 0) + ((t.amount_cents as number) ?? 0));
      }
    }
  }

  const rows: ClubRow[] = (links ?? []).map((l) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const club = (l as any).clubs as { id: string; name: string; city: string | null } | null;
    const cid = (l.club_id as string) ?? (club?.id ?? "");
    const rev = revByClub.get(cid) ?? 0;
    return {
      id: cid,
      n: club?.name ?? "—",
      city: club?.city ?? "—",
      events: eventsByClub.get(cid) ?? 0,
      revenue: `$${Math.round(rev / 100).toLocaleString("en-US")}`,
      since: fmtSince(l.linked_at as string),
    };
  });

  return { partnerId, rows };
}

export async function PartnerClubesScreen() {
  const data = await loadData();
  return <PartnerClubesScreenView data={data} />;
}
