// Generador de rondas para el formato AMERICANO (juego social).
//
// Mecánica real del americano: en cada ronda ROTAS de compañero y de rival, con
// el objetivo de que (idealmente) juegues con y contra todos. La puntuación es
// INDIVIDUAL (ver standings.ts). Acá solo armamos el emparejamiento de la
// SIGUIENTE ronda a partir de lo ya jugado.
//
// No usamos tablas precalculadas (solo cubren cuentas "bonitas"): un algoritmo
// greedy ronda-a-ronda funciona con cualquier nº de jugadores y maneja los
// descansos (byes) rotándolos para que todos descansen parejo.
//
// Decisiones:
//  • Dobles → 4 jugadores por partido (2v2); singles → 2 (1v1).
//  • Nº de partidos simultáneos = min(canchas, floor(activos / porPartido)).
//  • Byes: los reciben quienes MENOS han descansado (para equiparar); desempate
//    evitando descansar dos rondas seguidas; luego azar.
//  • Compañeros: greedy que minimiza repetir pareja.
//  • Rivales: greedy que minimiza repetir enfrentamiento.
//  • Canchas: se asignan ciclando por la cantidad disponible.

export type AmericanoMode = "singles" | "doubles";

// Game ya existente (para contar repeticiones y rondas previas). Los lados son a
// nivel jugador: p2 es null en singles.
export type PriorGame = {
  round_no: number;
  side_a_p1: string;
  side_a_p2: string | null;
  side_b_p1: string;
  side_b_p2: string | null;
};

// Game propuesto para la nueva ronda (sin ids de DB todavía).
export type DraftGame = {
  courtNo: number | null;
  sideA: string[]; // 1 (singles) o 2 (dobles) jugadores
  sideB: string[];
};

export type RoundPlan = {
  roundNo: number;
  games: DraftGame[];
  byes: string[]; // jugadores que descansan esta ronda
};

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Counts = {
  partner: Map<string, number>; // veces que dos jugadores fueron compañeros
  opponent: Map<string, number>; // veces que dos jugadores fueron rivales
  byes: Map<string, number>; // veces que un jugador descansó
  lastRound: number; // mayor round_no jugado
  byedLastRound: Set<string>; // quiénes descansaron en la última ronda
};

function tallyCounts(players: string[], prior: PriorGame[]): Counts {
  const partner = new Map<string, number>();
  const opponent = new Map<string, number>();
  const byes = new Map<string, number>();
  players.forEach((p) => byes.set(p, 0));

  const add = (m: Map<string, number>, a: string, b: string) => m.set(pairKey(a, b), (m.get(pairKey(a, b)) ?? 0) + 1);

  let lastRound = 0;
  const byRound = new Map<number, Set<string>>();
  for (const g of prior) {
    lastRound = Math.max(lastRound, g.round_no);
    const a = [g.side_a_p1, g.side_a_p2].filter((x): x is string => !!x);
    const b = [g.side_b_p1, g.side_b_p2].filter((x): x is string => !!x);
    if (a.length === 2) add(partner, a[0], a[1]);
    if (b.length === 2) add(partner, b[0], b[1]);
    for (const x of a) for (const y of b) add(opponent, x, y);
    const set = byRound.get(g.round_no) ?? new Set<string>();
    [...a, ...b].forEach((p) => set.add(p));
    byRound.set(g.round_no, set);
  }

  // Byes por ronda = inscritos que no jugaron esa ronda. byedLastRound = de la última.
  const byedLastRound = new Set<string>();
  for (const [round, played] of byRound.entries()) {
    for (const p of players) {
      if (!played.has(p)) {
        byes.set(p, (byes.get(p) ?? 0) + 1);
        if (round === lastRound) byedLastRound.add(p);
      }
    }
  }
  return { partner, opponent, byes, lastRound, byedLastRound };
}

// Elige a quiénes les toca descansar esta ronda (los que menos descansaron;
// evitando back-to-back; luego azar).
function pickByes(players: string[], need: number, c: Counts): Set<string> {
  if (need <= 0) return new Set();
  const ranked = shuffle(players).sort((x, y) => {
    const bx = c.byes.get(x) ?? 0;
    const by = c.byes.get(y) ?? 0;
    if (bx !== by) return bx - by; // menos byes primero (para equiparar)
    const lx = c.byedLastRound.has(x) ? 1 : 0;
    const ly = c.byedLastRound.has(y) ? 1 : 0;
    return lx - ly; // los que NO descansaron la última, primero
  });
  return new Set(ranked.slice(0, need));
}

// Forma equipos minimizando repetir compañero (solo dobles).
function formTeams(active: string[], c: Counts): string[][] {
  const pool = shuffle(active);
  const teams: string[][] = [];
  while (pool.length >= 2) {
    const p = pool.shift()!;
    let bestIdx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const cost = c.partner.get(pairKey(p, pool[i])) ?? 0;
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }
    const q = pool.splice(bestIdx, 1)[0];
    teams.push([p, q]);
  }
  return teams;
}

// Empareja equipos (o jugadores en singles) en partidos minimizando repetir rival.
function matchTeams(teams: string[][], c: Counts): Array<[string[], string[]]> {
  const pool = shuffle(teams);
  const games: Array<[string[], string[]]> = [];
  while (pool.length >= 2) {
    const t1 = pool.shift()!;
    let bestIdx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < pool.length; i++) {
      let cost = 0;
      for (const x of t1) for (const y of pool[i]) cost += c.opponent.get(pairKey(x, y)) ?? 0;
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }
    const t2 = pool.splice(bestIdx, 1)[0];
    games.push([t1, t2]);
  }
  return games;
}

/**
 * Arma la siguiente ronda de un americano.
 * @param participantIds inscritos asignados a la categoría (joined).
 * @param prior games ya creados en la categoría (para no repetir y contar byes).
 * @param mode singles | doubles.
 * @param courts canchas disponibles (0/undefined = todas las posibles).
 */
export function planAmericanoRound(
  participantIds: string[],
  prior: PriorGame[],
  mode: AmericanoMode,
  courts: number,
): RoundPlan | null {
  const players = Array.from(new Set(participantIds));
  const perGame = mode === "singles" ? 2 : 4;
  if (players.length < perGame) return null; // no alcanza ni para un partido

  const c = tallyCounts(players, prior);
  const maxByCourts = courts > 0 ? courts : Math.floor(players.length / perGame);
  const numGames = Math.max(1, Math.min(maxByCourts, Math.floor(players.length / perGame)));
  const activeCount = numGames * perGame;
  const byesNeeded = players.length - activeCount;

  const byes = pickByes(players, byesNeeded, c);
  const active = players.filter((p) => !byes.has(p));

  const teams = mode === "singles" ? active.map((p) => [p]) : formTeams(active, c);
  const pairings = matchTeams(teams, c);

  const games: DraftGame[] = pairings.map(([a, b], i) => ({
    courtNo: courts > 0 ? (i % courts) + 1 : i + 1,
    sideA: a,
    sideB: b,
  }));

  return { roundNo: c.lastRound + 1, games, byes: [...byes] };
}

/**
 * MOTOR ROLLING: elige el SIGUIENTE partido para una cancha que se acaba de
 * liberar. A diferencia de `planAmericanoRound` (arma una ronda entera), esto
 * arma UN solo partido tomando jugadores del pool libre.
 *
 * @param allPlayers   inscritos de la categoría.
 * @param prior        games previos (played + en juego) — para minimizar repetir
 *                     compañero/rival y medir descanso (cuántos jugó cada uno).
 * @param busy         jugadores ocupados AHORA en otras canchas (no disponibles).
 * @param justFinished jugadores que acaban de terminar en esta cancha.
 * @param mode         singles | doubles.
 * @param otherCourtsActive ¿hay otras canchas todavía jugando? Define la política
 *                     "esperar": si no hay banca (solo quedan libres los que recién
 *                     jugaron) y otras canchas siguen, devuelve null (la cancha
 *                     espera). Si TODAS están libres, arma con lo que haya.
 * @returns el partido (con courtNo null; lo fija el caller), o null si conviene
 *          esperar / no alcanza para un partido.
 */
export function pickNextCourtMatch(
  allPlayers: string[],
  prior: PriorGame[],
  busy: string[],
  justFinished: string[],
  mode: AmericanoMode,
  otherCourtsActive: boolean,
): DraftGame | null {
  const perGame = mode === "singles" ? 2 : 4;
  const players = Array.from(new Set(allPlayers));
  const busySet = new Set(busy);
  const free = players.filter((p) => !busySet.has(p));
  if (free.length < perGame) return null; // no alcanza ni un partido

  const c = tallyCounts(players, prior);

  // Descanso ≈ cuántos games jugó cada uno (menos = más descansado).
  const played = new Map<string, number>();
  for (const g of prior) {
    [g.side_a_p1, g.side_a_p2, g.side_b_p1, g.side_b_p2]
      .filter((x): x is string => !!x)
      .forEach((p) => played.set(p, (played.get(p) ?? 0) + 1));
  }
  const restRank = (p: string) => played.get(p) ?? 0;

  // Política "esperar": preferir banca (quienes NO acaban de terminar).
  const justSet = new Set(justFinished);
  const rested = free.filter((p) => !justSet.has(p));
  let pool: string[];
  if (rested.length >= perGame) {
    pool = rested;
  } else if (otherCourtsActive) {
    return null; // sin banca y otras canchas siguen → la cancha espera
  } else {
    pool = free; // todas las canchas libres (juego detenido) → arma con lo que haya
  }

  // Más descansados primero; barajado para desempatar parejo.
  const chosen = shuffle(pool)
    .sort((a, b) => restRank(a) - restRank(b))
    .slice(0, perGame);

  const teams = mode === "singles" ? chosen.map((p) => [p]) : formTeams(chosen, c);
  const pairings = matchTeams(teams, c);
  const first = pairings[0];
  if (!first) return null;
  return { courtNo: null, sideA: first[0], sideB: first[1] };
}
