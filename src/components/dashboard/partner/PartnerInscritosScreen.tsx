// Server: inscritos del torneo "headline" del partner (LIVE/próximo).
// Resuelve nombres reales de jugadores + status/método de pago para cada uno.
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

  // Prioridad: torneo en curso > próximo más cercano.
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
    .not("status", "in", "(withdrawn,rejected,cancelled)")
    .order("created_at", { ascending: false });

  // Resolver perfiles para todos los player_ids.
  const playerIdSet = new Set<string>();
  for (const r of regs ?? []) {
    for (const p of (r.player_ids as string[] | null) ?? []) playerIdSet.add(p);
  }
  const profById = new Map<string, { name: string; avatar: string | null }>();
  if (playerIdSet.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url")
      .in("id", Array.from(playerIdSet));
    for (const p of profs ?? []) {
      profById.set(p.id as string, {
        name: (p.display_name as string | null) ?? "Sin nombre",
        avatar: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  // Lookup transacciones para amount + status + method (online vs onsite).
  const txIds = (regs ?? [])
    .map((r) => r.paid_transaction_id as string | null)
    .filter((x): x is string => !!x);
  const txById = new Map<string, { amount: number; status: string; method: string }>();
  if (txIds.length > 0) {
    const { data: txns } = await supabase
      .from("transactions")
      .select("id,amount_cents,status,method")
      .in("id", txIds);
    for (const t of txns ?? []) {
      txById.set(t.id as string, {
        amount: (t.amount_cents as number) ?? 0,
        status: (t.status as string) ?? "pending",
        method: (t.method as string) ?? "transfer",
      });
    }
  }

  const rows: InscritoRow[] = (regs ?? []).map((r) => {
    const playerIds = (r.player_ids as string[] | null) ?? [];
    const firstProf = playerIds[0] ? profById.get(playerIds[0]) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamName = ((r as any).teams?.name as string | undefined) ?? null;
    const label = teamName
      ? teamName
      : playerIds.length > 1 && firstProf
        ? `${firstProf.name} +${playerIds.length - 1}`
        : firstProf?.name ?? "Jugador";

    const txId = r.paid_transaction_id as string | null;
    const tx = txId ? txById.get(txId) ?? null : null;
    const amtCents = tx?.amount ?? chosen!.fee;
    // Inferir modo: si no hay tx → free; si tx.status='pending_proof' o 'pending_review' o 'captured' por transfer → online (con comprobante). Si 'pending' simple → onsite (esperando cobro en club).
    let paymentMode: InscritoRow["paymentMode"];
    if (!tx) paymentMode = "free";
    else if (tx.status === "pending") paymentMode = "onsite";
    else paymentMode = "online";

    let payStatus: InscritoRow["payStatus"];
    if (!tx) payStatus = "free";
    else if (tx.status === "captured") payStatus = "paid";
    else if (tx.status === "pending") payStatus = "onsite_pending";
    else if (tx.status === "pending_proof") payStatus = "awaiting_proof";
    else if (tx.status === "pending_review") payStatus = "review";
    else payStatus = "other";

    return {
      id: r.id as string,
      team: label,
      avatarUrl: firstProf?.avatar ?? null,
      regStatus: r.status as string,
      paymentMode,
      payStatus,
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
