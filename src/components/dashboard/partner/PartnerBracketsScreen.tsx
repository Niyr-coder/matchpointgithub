// Server: brackets del torneo más reciente del partner, agrupados por categoría.
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import { getSession } from "@/lib/auth/session";
import {
  PartnerBracketsScreenView,
  type BracketsData,
  type BracketMatch,
  type BracketCategorySection,
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

function placeholderColumns(entryCount: number): { label: string; matches: BracketMatch[] }[] {
  const counts = knockoutRoundMatchCounts(entryCount);
  return counts.map((matchCount, idx) => ({
    label: knockoutRoundLabel(idx, counts.length),
    matches: Array.from({ length: matchCount }, () => ({ ...PLACEHOLDER_MATCH })),
  }));
}

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

function buildSectionFromMatches(
  bmList: RawMatch[],
  categoryId: string | null,
  categoryName: string | null,
  stage: string | null,
  canGenerateRandomBracket: boolean,
  nameByReg: Map<string, string>,
): BracketCategorySection {
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
  // Podio por categoría: 1° = ganador de la final, 2° = perdedor de la
  // final, 3° = ganador del partido de bronce (si existe).
  let runnerUpLabel: string | null = null;
  let thirdLabel: string | null = null;
  const finalRaw =
    sortedRounds.length > 0 ? byRound.get(sortedRounds[sortedRounds.length - 1])?.[0] : null;
  const finalMatchNode = columns[columns.length - 1]?.matches[0];
  if (finalRaw) {
    if (finalRaw.winner_side === "a" && finalRaw.side_a_registration_id) {
      championLabel = nameByReg.get(finalRaw.side_a_registration_id as string) ?? "Por decidir";
      if (finalRaw.side_b_registration_id)
        runnerUpLabel = nameByReg.get(finalRaw.side_b_registration_id as string) ?? null;
    } else if (finalRaw.winner_side === "b" && finalRaw.side_b_registration_id) {
      championLabel = nameByReg.get(finalRaw.side_b_registration_id as string) ?? "Por decidir";
      if (finalRaw.side_a_registration_id)
        runnerUpLabel = nameByReg.get(finalRaw.side_a_registration_id as string) ?? null;
    }
    if (finalRaw.scheduled_at) {
      const d = new Date(finalRaw.scheduled_at as string);
      championWhen = `Final · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
  }
  if (bronzeRaw?.winner_side) {
    const thirdId =
      bronzeRaw.winner_side === "a"
        ? bronzeRaw.side_a_registration_id
        : bronzeRaw.side_b_registration_id;
    if (thirdId) thirdLabel = nameByReg.get(thirdId) ?? null;
  }

  return {
    categoryId,
    categoryName,
    stage,
    canGenerateRandomBracket,
    hasBracket: columns.some((c) => c.matches.length > 0),
    columns,
    championLabel,
    championWhen,
    runnerUpLabel,
    thirdLabel,
    finalHasWinner: !!finalMatchNode?.w,
    thirdPlaceMatch: bronzeRaw ? mkMatch(bronzeRaw) : null,
  };
}

async function loadData(forceId?: string | null): Promise<BracketsData> {
  const placeholderSection: BracketCategorySection = {
    categoryId: null,
    categoryName: null,
    stage: null,
    canGenerateRandomBracket: true,
    hasBracket: false,
    columns: placeholderColumns(8),
    championLabel: "Por decidir",
    championWhen: "—",
  };
  const empty: BracketsData = {
    partnerId: null,
    tournamentId: null,
    tournamentName: null,
    tournamentSlug: null,
    displayToken: null,
    tournamentFormat: "single_elim",
    tournamentOptions: [],
    categories: [placeholderSection],
  };

  const partnerId = await resolveActivePartnerId();
  const supabase = await getServerClient();
  const now = new Date();
  const admin = getAdminClient();

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
    status: string;
    display_token: string | null;
  };
  const TOUR_COLS = "id,name,format,starts_at,ends_at,slug,status,display_token";

  // Lista para el selector de torneo: los 30 más recientes del partner
  // (antes: los 20 más ANTIGUOS con order ascending → un partner con
  // historial siempre veía su primer torneo y nunca los nuevos).
  let tours: TourPick[] = [];
  if (partnerId) {
    const { data } = await supabase
      .from("tournaments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(TOUR_COLS as any)
      .eq("partner_id", partnerId)
      .neq("status", "draft")
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(30);
    tours = (data ?? []) as unknown as TourPick[];
  }

  // ?tid= se resuelve con lookup directo (antes dependía de que el torneo
  // estuviera dentro de la lista limitada → caía a otro torneo en silencio).
  // Partner: solo torneos propios; admin: cualquiera.
  let forced: TourPick | null = null;
  if (forceId) {
    forced = tours.find((t) => t.id === forceId) ?? null;
    if (!forced && (isAdmin || partnerId)) {
      const client = isAdmin ? admin : supabase;
      let q = client
        .from("tournaments")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(TOUR_COLS as any)
        .eq("id", forceId)
        .neq("status", "draft")
        .neq("status", "cancelled");
      if (!isAdmin) q = q.eq("partner_id", partnerId!);
      const { data } = await q.limit(1);
      forced = ((data ?? []) as unknown as TourPick[])[0] ?? null;
      if (forced) tours = [forced, ...tours];
    }
  }

  const pick = (t: TourPick) => ({
    id: t.id,
    name: t.name ?? "—",
    format: t.format ?? "single_elim",
    slug: t.slug ?? "",
    displayToken: t.display_token ?? null,
  });

  // Default inteligente: en vivo → en curso por fechas → próximo más
  // cercano → el pasado más reciente (antes: el torneo más antiguo).
  let chosen: ReturnType<typeof pick> | null = forced ? pick(forced) : null;
  if (!chosen) {
    const live = tours.find((t) => t.status === "live");
    const inWindow = tours.find((t) => {
      const s = new Date(t.starts_at);
      const e = t.ends_at ? new Date(t.ends_at) : s;
      return s <= now && now <= e;
    });
    // tours viene en starts_at desc: el próximo más cercano es el ÚLTIMO
    // de los futuros; el pasado más reciente es el PRIMERO de los pasados.
    const upcoming = [...tours].reverse().find((t) => new Date(t.starts_at) > now);
    const recentPast = tours.find((t) => new Date(t.starts_at) <= now);
    const def = live ?? inWindow ?? upcoming ?? recentPast ?? tours[0] ?? null;
    if (def) chosen = pick(def);
  }

  const tournamentOptions = tours.map((t) => ({
    id: t.id,
    name: t.name ?? "—",
    startsAt: t.starts_at,
    status: t.status,
  }));

  if (!chosen) {
    return { ...empty, partnerId: partnerId ?? null };
  }

  const canGenerateRandomBracket = chosen.format !== "groups_to_knockout";

  // Cargar todos los brackets del torneo y las categorías en paralelo
  const [bracketsResult, catsResult] = await Promise.all([
    admin
      .from("brackets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id,category_id,format,size" as any)
      .eq("tournament_id", chosen.id)
      .order("generated_at", { ascending: false }),
    admin
      .from("tournament_categories")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id,name,stage" as any)
      .eq("tournament_id", chosen.id)
      .order("created_at" as any, { ascending: true }),
  ]);

  type BracketRow = { id: string; category_id: string | null; format: string; size: number };
  type CatRow = { id: string; name: string; stage: string };
  const allBrackets = (bracketsResult.data ?? []) as unknown as BracketRow[];
  const cats = (catsResult.data ?? []) as unknown as CatRow[];

  // Bracket más reciente por category_id (ya ordenado por generated_at desc)
  const latestBracketByCat = new Map<string | null, { id: string; format: string; size: number }>();
  for (const b of allBrackets) {
    const catKey = b.category_id ?? null;
    if (!latestBracketByCat.has(catKey)) {
      latestBracketByCat.set(catKey, { id: b.id, format: b.format, size: b.size });
    }
  }

  // Sin brackets todavía
  if (latestBracketByCat.size === 0) {
    const { count: regCount } = await admin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", chosen.id)
      .eq("status", "accepted");
    const perCat = Math.max(Math.floor((regCount ?? 0) / Math.max(cats.length, 1)), 2);

    const categories: BracketCategorySection[] =
      cats.length > 0
        ? cats.map((cat) => ({
            categoryId: cat.id,
            categoryName: cat.name,
            stage: cat.stage,
            canGenerateRandomBracket,
            hasBracket: false,
            columns: placeholderColumns(perCat),
            championLabel: "Por decidir",
            championWhen: canGenerateRandomBracket ? "—" : "Genera la llave desde gestión del torneo",
          }))
        : [
            {
              categoryId: null,
              categoryName: null,
              stage: null,
              canGenerateRandomBracket,
              hasBracket: false,
              columns: placeholderColumns(Math.max(regCount ?? 0, 2)),
              championLabel: "Por decidir",
              championWhen: canGenerateRandomBracket ? "—" : "Genera la llave desde gestión del torneo",
            },
          ];

    return {
      partnerId: partnerId ?? null,
      tournamentId: chosen.id,
      tournamentName: chosen.name,
      tournamentSlug: chosen.slug,
      displayToken: chosen.displayToken,
      tournamentFormat: chosen.format,
      tournamentOptions,
      categories,
    };
  }

  // Determinar qué secciones mostrar:
  // Si hay categorías definidas → una sección por categoría (con o sin bracket)
  // Si no hay categorías → una sección por bracket (null category_id)
  let sectionKeys: Array<{ catId: string | null; catName: string | null; stage: string | null }>;

  if (cats.length > 0) {
    // Secciones en el orden de las categorías registradas
    sectionKeys = cats.map((c) => ({ catId: c.id, catName: c.name, stage: c.stage }));
    // Agregar brackets sin categoría asignada si los hay (caso inusual)
    if (latestBracketByCat.has(null)) {
      sectionKeys.push({ catId: null, catName: null, stage: null });
    }
  } else {
    // Sin categorías: una entrada por bracket (típicamente una sola con null)
    sectionKeys = Array.from(latestBracketByCat.keys()).map((k) => ({
      catId: k,
      catName: null,
      stage: null,
    }));
  }

  // Cargar matches de todas las secciones que tienen bracket, en paralelo
  const sectionsWithBracket = sectionKeys.filter((s) => latestBracketByCat.has(s.catId));
  const bmResults = await Promise.all(
    sectionsWithBracket.map((s) =>
      admin
        .from("bracket_matches")
        .select(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "id,round,position,side_a_registration_id,side_b_registration_id,score,status,winner_side,scheduled_at,is_bronze" as any,
        )
        .eq("bracket_id", latestBracketByCat.get(s.catId)!.id)
        .order("round", { ascending: true })
        .order("position", { ascending: true }),
    ),
  );

  // Un solo fetch de labels para todas las inscripciones
  const allRegIds = new Set<string>();
  for (const result of bmResults) {
    for (const m of (result.data ?? []) as unknown as RawMatch[]) {
      if (m.side_a_registration_id) allRegIds.add(m.side_a_registration_id);
      if (m.side_b_registration_id) allRegIds.add(m.side_b_registration_id);
    }
  }
  const nameByReg = await registrationLabels(Array.from(allRegIds));

  // Construir secciones
  const categories: BracketCategorySection[] = sectionKeys.map((sec) => {
    const hasBracket = latestBracketByCat.has(sec.catId);
    if (!hasBracket) {
      return {
        categoryId: sec.catId,
        categoryName: sec.catName,
        stage: sec.stage,
        canGenerateRandomBracket,
        hasBracket: false,
        columns: placeholderColumns(2),
        championLabel: "Por decidir",
        championWhen: canGenerateRandomBracket ? "—" : "Genera la llave desde gestión del torneo",
      };
    }

    const bracketIdx = sectionsWithBracket.findIndex((s) => s.catId === sec.catId);
    const bmList = (bmResults[bracketIdx].data ?? []) as unknown as RawMatch[];

    return buildSectionFromMatches(
      bmList,
      sec.catId,
      sec.catName,
      sec.stage,
      canGenerateRandomBracket,
      nameByReg,
    );
  });

  return {
    partnerId: partnerId ?? null,
    tournamentId: chosen.id,
    tournamentName: chosen.name,
    tournamentSlug: chosen.slug,
    displayToken: chosen.displayToken,
    tournamentFormat: chosen.format,
    tournamentOptions,
    categories,
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
