// Server: inscritos del torneo "headline" (LIVE/próximo) del partner.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import {
  PartnerInscritosScreenView,
  type InscritosData,
  type InscritoRow,
} from "./PartnerInscritosScreenView";

function relTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days < 1) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} d`;
}

async function loadData(): Promise<InscritosData> {
  const partnerId = await resolveActivePartnerId();
  if (!partnerId) {
    return { partnerId: null, tournamentName: null, capacity: 0, rows: [] };
  }

  const supabase = await getServerClient();
  const now = new Date();

  const { data: tours } = await supabase
    .from("tournaments")
    .select("id,name,starts_at,ends_at,max_participants,entry_fee_cents")
    .eq("partner_id", partnerId)
    .neq("status", "draft")
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true })
    .limit(20);

  let chosen: { id: string; name: string; cap: number; fee: number } | null = null;
  for (const t of tours ?? []) {
    const s = new Date(t.starts_at as string);
    const e = new Date(t.ends_at as string);
    if (s <= now && now <= e) {
      chosen = {
        id: t.id as string,
        name: (t.name as string) ?? "—",
        cap: (t.max_participants as number | null) ?? 0,
        fee: (t.entry_fee_cents as number | null) ?? 0,
      };
      break;
    }
  }
  if (!chosen && tours && tours[0]) {
    chosen = {
      id: tours[0].id as string,
      name: (tours[0].name as string) ?? "—",
      cap: (tours[0].max_participants as number | null) ?? 0,
      fee: (tours[0].entry_fee_cents as number | null) ?? 0,
    };
  }

  if (!chosen) {
    return { partnerId, tournamentName: null, capacity: 0, rows: [] };
  }

  const { data: regs } = await supabase
    .from("registrations")
    .select("id,team_id,player_ids,status,paid_transaction_id,created_at,teams(name)")
    .eq("tournament_id", chosen.id)
    .in("status", ["accepted", "pending"])
    .order("created_at", { ascending: false });

  // Para precios reales: lookup en transactions.
  const txIds = (regs ?? [])
    .map((r) => r.paid_transaction_id as string | null)
    .filter((x): x is string => !!x);
  const txAmtById = new Map<string, number>();
  if (txIds.length > 0) {
    const { data: txns } = await supabase
      .from("transactions")
      .select("id,amount_cents,status")
      .in("id", txIds);
    for (const t of txns ?? []) {
      txAmtById.set(t.id as string, (t.amount_cents as number) ?? 0);
    }
  }

  const rows: InscritoRow[] = (regs ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamName = ((r as any).teams?.name as string) ?? "Equipo";
    const paid = !!r.paid_transaction_id;
    const amtCents = paid
      ? txAmtById.get(r.paid_transaction_id as string) ?? chosen!.fee
      : chosen!.fee;
    return {
      id: r.id as string,
      team: teamName,
      avg: null, // MP Rating promedio del equipo — sin agregado calculado en DB todavía
      club: "—", // sin link reg→club
      paid,
      amt: amtCents > 0 ? `$${Math.round(amtCents / 100)}` : "$—",
      when: relTime(r.created_at as string, now),
    };
  });

  return {
    partnerId,
    tournamentName: chosen.name,
    capacity: chosen.cap,
    rows,
  };
}

export async function PartnerInscritosScreen() {
  const data = await loadData();
  return <PartnerInscritosScreenView data={data} />;
}
