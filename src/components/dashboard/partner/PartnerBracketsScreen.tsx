// Server: bracket en vivo del torneo más reciente (LIVE o próximo) del partner.
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import { getSession } from "@/lib/auth/session";
import {
  PartnerBracketsScreenView,
  type BracketsData,
  type BracketMatch,
} from "./PartnerBracketsScreenView";
import {
  knockoutRoundLabel,
  knockoutRoundMatchCounts,
} from "@/lib/torneos/bracket-labels";

function formatSetScore(score: unknown): { sa: number | string; sb: number | string } {
  const s = score as { sets?: Array<{ a?: number; b?: number }> } | null;
  if (!s?.sets?.length) return { sa: "-", sb: "-" };
  let aW = 0;
  let bW = 0;
  for (const set of s.sets) {
    if ((set.a ?? 0) > (set.b ?? 0)) aW++;
    else if ((set.b ?? 0) > (set.a ?? 0)) bW++;
  }
  return { sa: aW, sb: bW };
}

async function registrationLabels(regIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (regIds.length === 0) return out;

  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: regs } = await admin
    .from("registrations")
    .select("id,team_id,player_ids,teams(name)" as any)
    .in("id", regIds) as unknown as {
      data: Array<{ id: string; team_id: string | null; player_ids: string[] | null; teams: { name: string } | null }> | null;
    };

  // Fetch guest_names por separado (no está en los tipos generados).
  const guestsByRegId = new Map<string, string[]>();
  {
    const { data: gr } = await admin
      .from("registrations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id,guest_names" as any)
      .in("id", regIds) as unknown as { data: Array<{ id: string; guest_names: string[] | null }> | null };
    for (const g of gr ?? []) {
      if (g.guest_names?.length) guestsByRegId.set(g.id, g.guest_names);
    }
  }

  const playerIdSet = new Set<string>();
  for (const r of regs ?? []) {
    for (const p of r.player_ids ?? []) playerIdSet.add(p);
  }
  const profById = new Map<string, string>();
  if (playerIdSet.size > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id,display_name")
      .in("id", Array.from(playerIdSet));
    for (const p of profs ?? []) {
      profById.set(p.id as string, (p.display_name as string | null) ?? "Jugador");
    }
  }

  for (const r of regs ?? []) {
    const pids = r.player_ids ?? [];
    const teamName = r.teams?.name ?? null;
    const guests = guestsByRegId.get(r.id) ?? [];
    const label = teamName
      ? teamName
      : pids.length > 0
        ? pids.map((pid) => profById.get(pid) ?? "Jugador").join(" / ")
        : guests.length > 0
          ? guests.join(" / ")
          : "Equipo";
    out.set(r.id, label);
  }
  return out;
}

const PLACEHOLDER_MATCH: BracketMatch = {
  id: "",
  a: "TBD",
  b: "TBD",
  sa: "-",
  sb: "-",
  status: "scheduled",
  reportable: false,
  correctable: false,
};

function placeholderColumns(entryCount: number): BracketsData["columns"] {
  const counts = knockoutRoundMatchCounts(entryCount);
  return counts.map((matchCount, idx) => ({
    label: knockoutRoundLabel(idx, counts.length),
    matches: Array.from({ length: matchCount }, () => ({ ...PLACEHOLDER_MATCH })),
  }));
}

async function loadData(forceId?: string | null): Promise<BracketsData> {
  const empty: BracketsData = {
    partnerId: null,
    tournamentId: null,
    tournamentName: null,
    tournamentSlug: null,
    displayToken: null,
    tournamentFormat: "single_elim",
    canGenerateRandomBracket: true,
    columns: placeholderColumns(8),
    hasBracket: false,
    championLabel: "Por decidir",
    championWhen: "—",
  };

  const partnerId = await resolveActivePartnerId();
  const supabase = await getServerClient();
  const now = new Date();
  const admin = getAdminClient();

  // Admin de plataforma puede acceder a cualquier torneo via ?tid= para soporte.
  let isAdmin = false;
  const session = await getSession();
  if (session.authenticated) {
    const { data: ar } = await supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", session.session.userId)
      .eq("role", "admin")
      .is("revoked_at", null)
      .maybeSingle();
    isAdmin = !!ar;
  }

  if (!partnerId && !isAdmin) return empty;

  type TourPick = {
    id: string;
    name: string;
    format: string;
    starts_at: string;
    ends_at: string | null;
    slug: string;
    display_token: string | null;
  };

  let tours: TourPick[];

  if (isAdmin && forceId) {
    // Admin con ?tid=: carga directo sin restricción de partner.
    const { data } = await admin
      .from("tournaments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id,name,format,starts_at,ends_at,slug,display_token" as any)
      .eq("id", forceId)
      .neq("status", "draft")
      .neq("status", "cancelled")
      .limit(1);
    tours = (data ?? []) as unknown as TourPick[];
  } else {
    if (!partnerId) return empty;
    const { data } = await supabase
      .from("tournaments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id,name,format,starts_at,ends_at,slug,display_token" as any)
      .eq("partner_id", partnerId)
      .neq("status", "draft")
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(20);
    tours = (data ?? []) as unknown as TourPick[];
  }

  let chosen: {
    id: string;
    name: string;
    format: string;
    slug: string;
    displayToken: string | null;
  } | null = null;

  if (forceId) {
    const forced = tours.find((t) => t.id === forceId);
    if (forced) {
      chosen = {
        id: forced.id,
        name: forced.name ?? "—",
        format: forced.format ?? "single_elim",
        slug: forced.slug ?? "",
        displayToken: forced.display_token ?? null,
      };
    }
  }

  if (!chosen) {
    for (const t of tours) {
      const s = new Date(t.starts_at);
      const e = t.ends_at ? new Date(t.ends_at) : s;
      if (s <= now && now <= e) {
        chosen = {
          id: t.id,
          name: t.name ?? "—",
          format: t.format ?? "single_elim",
          slug: t.slug ?? "",
          displayToken: t.display_token ?? null,
        };
        break;
      }
    }
  }
  if (!chosen && tours[0]) {
    chosen = {
      id: tours[0].id,
      name: tours[0].name ?? "—",
      format: tours[0].format ?? "single_elim",
      slug: tours[0].slug ?? "",
      displayToken: tours[0].display_token ?? null,
    };
  }

  if (!chosen) {
    return { ...empty, partnerId: partnerId ?? null };
  }

  const canGenerateRandomBracket = chosen.format !== "groups_to_knockout";

  const { data: brackets } = await admin
    .from("brackets")
    .select("id")
    .eq("tournament_id", chosen.id)
    .order("generated_at", { ascending: false })
    .limit(1);
  const bracketId = brackets?.[0]?.id as string | undefined;
  if (!bracketId) {
    const { count: regCount } = await admin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", chosen.id)
      .eq("status", "accepted");
    return {
      partnerId: partnerId ?? null,
      tournamentId: chosen.id,
      tournamentName: chosen.name,
      tournamentSlug: chosen.slug,
      displayToken: chosen.displayToken,
      tournamentFormat: chosen.format,
      canGenerateRandomBracket,
      columns: placeholderColumns(Math.max(regCount ?? 0, 2)),
      hasBracket: false,
      championLabel: "Por decidir",
      championWhen: canGenerateRandomBracket
        ? "—"
        : "Genera la llave desde gestión del torneo",
    };
  }

  const { data: bm } = await admin
    .from("bracket_matches")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select(
      "id,round,position,side_a_registration_id,side_b_registration_id,score,status,winner_side,scheduled_at,is_bronze" as any,
    )
    .eq("bracket_id", bracketId)
    .order("round", { ascending: true })
    .order("position", { ascending: true });

  type RawMatch = {
    id: string;
    round: number;
    position: number;
    side_a_registration_id: string | null;
    side_b_registration_id: string | null;
    score: unknown;
    status: string;
    winner_side: string | null;
    scheduled_at: string | null;
    is_bronze?: boolean;
  };
  const bmList = (bm ?? []) as unknown as RawMatch[];

  const regIds = new Set<string>();
  for (const m of bmList) {
    if (m.side_a_registration_id) regIds.add(m.side_a_registration_id);
    if (m.side_b_registration_id) regIds.add(m.side_b_registration_id);
  }
  const nameByReg = await registrationLabels(Array.from(regIds));

  function mkMatch(raw: RawMatch): BracketMatch {
    const aName = raw.side_a_registration_id
      ? nameByReg.get(raw.side_a_registration_id) ?? "—"
      : "TBD";
    const bName = raw.side_b_registration_id
      ? nameByReg.get(raw.side_b_registration_id) ?? "—"
      : "TBD";
    const { sa, sb } = formatSetScore(raw.score);
    const w = raw.winner_side === "a" ? "a" : raw.winner_side === "b" ? "b" : undefined;
    const status = raw.status;
    const hasBoth =
      !!raw.side_a_registration_id &&
      !!raw.side_b_registration_id &&
      raw.side_a_registration_id !== raw.side_b_registration_id;
    const reportable =
      hasBoth &&
      status !== "reported" &&
      status !== "confirmed" &&
      status !== "cancelled";
    const correctable =
      hasBoth &&
      (status === "reported" || status === "confirmed");
    return {
      id: raw.id,
      a: aName,
      b: bName,
      sa,
      sb,
      w,
      live: status === "live",
      status,
      reportable,
      correctable,
    };
  }

  const bronzeRaw = bmList.find((m) => m.is_bronze);
  const mainBm = bmList.filter((m) => !m.is_bronze);

  const byRound = new Map<number, RawMatch[]>();
  for (const m of mainBm) {
    const r = m.round as number;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(m);
  }
  const sortedRounds = Array.from(byRound.keys()).sort((a, b) => a - b);
  const totalRounds = sortedRounds.length;
  const columns = sortedRounds.map((roundNum, idx) => ({
    label: knockoutRoundLabel(idx, totalRounds),
    matches: (byRound.get(roundNum) ?? [])
      .sort((a, b) => (a.position as number) - (b.position as number))
      .map(mkMatch),
  }));

  let championLabel = "Por decidir";
  let championWhen = "—";
  const finalRaw =
    sortedRounds.length > 0 ? byRound.get(sortedRounds[sortedRounds.length - 1])?.[0] : null;
  const finalMatch = columns[columns.length - 1]?.matches[0];
  if (finalRaw) {
    if (finalRaw.winner_side === "a" && finalRaw.side_a_registration_id) {
      championLabel = nameByReg.get(finalRaw.side_a_registration_id as string) ?? "Por decidir";
    } else if (finalRaw.winner_side === "b" && finalRaw.side_b_registration_id) {
      championLabel = nameByReg.get(finalRaw.side_b_registration_id as string) ?? "Por decidir";
    }
    if (finalRaw.scheduled_at) {
      const d = new Date(finalRaw.scheduled_at as string);
      championWhen = `Final · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
  }

  return {
    partnerId: partnerId ?? null,
    tournamentId: chosen.id,
    tournamentName: chosen.name,
    tournamentSlug: chosen.slug,
    displayToken: chosen.displayToken,
    tournamentFormat: chosen.format,
    canGenerateRandomBracket,
    columns,
    hasBracket: columns.some((c) => c.matches.length > 0),
    championLabel,
    championWhen,
    finalHasWinner: !!finalMatch?.w,
    thirdPlaceMatch: bronzeRaw ? mkMatch(bronzeRaw) : null,
  };
}

export async function PartnerBracketsScreen({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const forceId = typeof sp.tid === "string" ? sp.tid : null;
  const data = await loadData(forceId);
  return <PartnerBracketsScreenView data={data} />;
}
