// Server: fetch quedadas para Descubrir (open + abiertas a futuro) y Mis quedadas
// (las que organizo o donde estoy inscrito/invitado). Las tablas `quedadas` y
// `quedada_participants` aún no están en los tipos generados → cliente sin tipar
// (patrón ya usado en src/server/actions/quedadas.ts).
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { rosterModeFor } from "@/lib/quedadas/engines/registry";
import { loadQuedadaProfileStats } from "./loadQuedadaProfileStats.server";
import { QuedadasScreenView, type QuedadaLite } from "./QuedadasScreenView";

type Row = {
  id: string;
  creator_id: string;
  club_id: string | null;
  title: string;
  description: string | null;
  format: string;
  match_mode: string;
  visibility: string;
  status: string;
  starts_at: string;
  created_at: string;
  location_text: string | null;
  max_players: number | null;
  fee_cents: number | null;
  perks_text: string | null;
  ranked: boolean | null;
};

export async function QuedadasScreen() {
  const session = await getSession();
  const meUserId = session.authenticated ? session.session.userId : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await getServerClient()) as any;

  const nowIso = new Date().toISOString();
  const SELECT =
    "id,creator_id,club_id,title,description,format,match_mode,visibility,status,starts_at,created_at,location_text,max_players,fee_cents,perks_text,ranked";

  // Descubrir: quedadas abiertas y con inscripción abierta a futuro.
  const discoverPromise = supabase
    .from("quedadas")
    .select(SELECT)
    .eq("visibility", "open")
    .eq("status", "registration_open")
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(60);

  // Mis quedadas: filas donde estoy unido/invitado (para luego sumar las que organizo).
  const myPartsPromise = meUserId
    ? supabase
        .from("quedada_participants")
        .select("quedada_id,status")
        .eq("user_id", meUserId)
        .in("status", ["joined", "invited"])
    : Promise.resolve({ data: [] as { quedada_id: string; status: string }[] });

  const myCreatedPromise = meUserId
    ? supabase
        .from("quedadas")
        .select(SELECT)
        .eq("creator_id", meUserId)
        .order("starts_at", { ascending: true })
        .limit(60)
    : Promise.resolve({ data: [] as Row[] });

  const [discoverRes, myPartsRes, myCreatedRes] = await Promise.all([
    discoverPromise,
    myPartsPromise,
    myCreatedPromise,
  ]);

  const discoverRows: Row[] = (discoverRes.data ?? []) as Row[];
  const myCreatedRows: Row[] = (myCreatedRes.data ?? []) as Row[];
  const myParts: { quedada_id: string; status: string }[] = myPartsRes.data ?? [];

  // IDs que necesito traer para "Mis quedadas" pero que no estén ya en myCreated.
  const createdIds = new Set(myCreatedRows.map((r) => r.id));
  const partIds = myParts.map((p) => p.quedada_id).filter((id) => !createdIds.has(id));

  const extraRowsRes = partIds.length
    ? await supabase.from("quedadas").select(SELECT).in("id", partIds)
    : { data: [] as Row[] };
  const extraRows: Row[] = (extraRowsRes.data ?? []) as Row[];

  // Universo de filas a hidratar (descubrir + mis creadas + donde participo).
  const allRows: Row[] = [...discoverRows, ...myCreatedRows, ...extraRows];
  const uniqueRows = new Map<string, Row>();
  for (const r of allRows) uniqueRows.set(r.id, r);
  const rowList = Array.from(uniqueRows.values());
  const allIds = rowList.map((r) => r.id);

  // Conteo de participantes 'joined' por quedada.
  const countByQuedada = new Map<string, number>();
  if (allIds.length) {
    const { data: countRows } = await supabase
      .from("quedada_participants")
      .select("quedada_id")
      .in("quedada_id", allIds)
      .eq("status", "joined");
    for (const cr of (countRows ?? []) as { quedada_id: string }[]) {
      countByQuedada.set(cr.quedada_id, (countByQuedada.get(cr.quedada_id) ?? 0) + 1);
    }
  }

  // Cupo por categorías: suma de max_slots por quedada. El cupo MÁXIMO efectivo
  // sale de aquí cuando hay categorías (× jugadores por cupo, según formato);
  // si no hay categorías, se usa el max_players global de la quedada.
  const slotsByQuedada = new Map<string, number>();
  if (allIds.length) {
    const { data: catRows } = await supabase
      .from("quedada_categories")
      .select("quedada_id,max_slots")
      .in("quedada_id", allIds);
    for (const cr of (catRows ?? []) as { quedada_id: string; max_slots: number | null }[]) {
      if (cr.max_slots == null) continue;
      slotsByQuedada.set(cr.quedada_id, (slotsByQuedada.get(cr.quedada_id) ?? 0) + cr.max_slots);
    }
  }

  // Nombres de los creadores.
  const creatorIds = Array.from(new Set(rowList.map((r) => r.creator_id)));
  const nameById = new Map<string, string>();
  const premiumById = new Map<string, boolean>();
  if (creatorIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name,plan_tier,plan_expires_at")
      .in("id", creatorIds);
    const nowMs = new Date(nowIso).getTime();
    for (const p of (profs ?? []) as {
      id: string;
      display_name: string | null;
      plan_tier: string | null;
      plan_expires_at: string | null;
    }[]) {
      if (p.display_name) nameById.set(p.id, p.display_name);
      // MP+ activo: premium y no expirado (mismo criterio que isPlanActive).
      const premium = p.plan_tier === "premium" && (p.plan_expires_at === null || new Date(p.plan_expires_at).getTime() > nowMs);
      premiumById.set(p.id, premium);
    }
  }

  const joinedIds = new Set(
    myParts.filter((p) => p.status === "joined").map((p) => p.quedada_id),
  );
  const invitedIds = new Set(
    myParts.filter((p) => p.status === "invited").map((p) => p.quedada_id),
  );

  const toLite = (r: Row): QuedadaLite => ({
    id: r.id,
    creatorId: r.creator_id,
    creatorName: nameById.get(r.creator_id) ?? "Organizador",
    title: r.title,
    description: r.description,
    format: r.format,
    matchMode: r.match_mode === "singles" ? "singles" : "doubles",
    visibility: r.visibility === "private" ? "private" : "open",
    status: r.status,
    startsAt: r.starts_at,
    createdAt: r.created_at,
    locationText: r.location_text,
    // Cupo efectivo: categorías (suma de cupos × jugadores/cupo) o max_players global.
    maxPlayers: (() => {
      const mode = r.match_mode === "singles" ? "singles" : "doubles";
      const perSlot = rosterModeFor(r.format, mode) === "individual" ? 1 : 2;
      const catSlots = slotsByQuedada.get(r.id) ?? 0;
      return catSlots > 0 ? catSlots * perSlot : r.max_players;
    })(),
    feeCents: r.fee_cents ?? 0,
    perks: r.perks_text,
    participantCount: countByQuedada.get(r.id) ?? 0,
    iAmCreator: r.creator_id === meUserId,
    iAmJoined: joinedIds.has(r.id),
    iAmInvited: invitedIds.has(r.id),
    creatorIsPremium: premiumById.get(r.creator_id) ?? false,
  });

  const discover = discoverRows
    .map(toLite)
    // No tiene sentido mostrarte en Descubrir lo que ya organizas o donde ya estás.
    .filter((q) => !q.iAmCreator && !q.iAmJoined);

  // Mis quedadas: organizadas + donde participo/invitado, deduplicadas.
  const mineMap = new Map<string, QuedadaLite>();
  for (const r of [...myCreatedRows, ...extraRows]) mineMap.set(r.id, toLite(r));
  const mine = Array.from(mineMap.values()).sort(
    (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt),
  );

  const myActivityStats = meUserId ? await loadQuedadaProfileStats(meUserId) : null;

  return (
    <QuedadasScreenView
      meUserId={meUserId}
      discover={discover}
      mine={mine}
      myActivityStats={myActivityStats}
    />
  );
}
