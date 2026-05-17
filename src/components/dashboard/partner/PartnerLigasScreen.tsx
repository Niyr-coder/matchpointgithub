// Server: ligas del partner con conteo de equipos y revenue por liga.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import { PartnerLigasScreenView, type LigasData, type LigaRow, type LigaStatus } from "./PartnerLigasScreenView";

function mapStatus(dbStatus: string): LigaStatus {
  if (dbStatus === "active") return "EN CURSO";
  if (dbStatus === "draft") return "PRÓXIMA";
  if (dbStatus === "finished") return "FINALIZADA";
  return "ARCHIVADA";
}

async function loadData(): Promise<LigasData> {
  const partnerId = await resolveActivePartnerId();
  if (!partnerId) return { partnerId: null, rows: [] };

  const supabase = await getServerClient();

  const { data: leagues } = await supabase
    .from("leagues")
    .select("id,name,status,season")
    .eq("partner_id", partnerId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  const leagueIds = (leagues ?? []).map((l) => l.id as string);
  const tourByLeague = new Map<string, string[]>();
  const revByLeague = new Map<string, number>();
  const teamsByLeague = new Map<string, number>();

  if (leagueIds.length > 0) {
    const { data: tournaments } = await supabase
      .from("tournaments")
      .select("id,league_id")
      .in("league_id", leagueIds);
    for (const t of tournaments ?? []) {
      const lid = t.league_id as string;
      if (!tourByLeague.has(lid)) tourByLeague.set(lid, []);
      tourByLeague.get(lid)!.push(t.id as string);
    }
    const tourIds = (tournaments ?? []).map((t) => t.id as string);
    if (tourIds.length > 0) {
      const [{ data: regs }, { data: txns }] = await Promise.all([
        supabase
          .from("registrations")
          .select("tournament_id,team_id,status")
          .in("tournament_id", tourIds)
          .in("status", ["accepted", "pending"]),
        supabase
          .from("transactions")
          .select("ref_id,amount_cents")
          .eq("kind", "tournament")
          .eq("status", "captured")
          .in("ref_id", tourIds),
      ]);
      const teamSetByLeague = new Map<string, Set<string>>();
      const tourToLeague = new Map<string, string>();
      for (const [lid, tids] of tourByLeague) for (const tid of tids) tourToLeague.set(tid, lid);
      for (const r of regs ?? []) {
        const tid = r.tournament_id as string;
        const lid = tourToLeague.get(tid);
        if (!lid || !r.team_id) continue;
        if (!teamSetByLeague.has(lid)) teamSetByLeague.set(lid, new Set());
        teamSetByLeague.get(lid)!.add(r.team_id as string);
      }
      for (const [lid, s] of teamSetByLeague) teamsByLeague.set(lid, s.size);
      for (const t of txns ?? []) {
        const tid = t.ref_id as string;
        const lid = tourToLeague.get(tid);
        if (!lid) continue;
        revByLeague.set(lid, (revByLeague.get(lid) ?? 0) + ((t.amount_cents as number) ?? 0));
      }
    }
  }

  const rows: LigaRow[] = (leagues ?? []).map((l) => {
    const totalTours = (tourByLeague.get(l.id as string) ?? []).length;
    const rev = revByLeague.get(l.id as string) ?? 0;
    return {
      id: l.id as string,
      n: (l.name as string) ?? "—",
      teams: teamsByLeague.get(l.id as string) ?? 0,
      jornada: totalTours > 0 ? `— / ${totalTours}` : "— / —",
      revenue: `$${Math.round(rev / 100).toLocaleString("en-US")}`,
      st: mapStatus(l.status as string),
    };
  });

  return { partnerId, rows };
}

export async function PartnerLigasScreen() {
  const data = await loadData();
  return <PartnerLigasScreenView data={data} />;
}
