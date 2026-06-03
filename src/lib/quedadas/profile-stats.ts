// Estadísticas agregadas de quedadas para perfil del jugador.
// Se derivan de quedadas finalizadas + games played (append-only).

import type { GameForStandings } from "./standings";

export type QuedadaProfileRecent = {
  quedadaId: string;
  title: string;
  format: string;
  finishedAt: string;
  finalRank: number | null;
  gamesPlayed: number;
  gameWins: number;
};

export type QuedadaProfileStats = {
  finishedCount: number;
  activeCount: number;
  gamesPlayed: number;
  gameWins: number;
  gameWinRate: number;
  podiums: { first: number; second: number; third: number; total: number };
  podiumStreak: number;
  winStreak: number;
  recent: QuedadaProfileRecent[];
};

export type QuedadaParticipantRow = {
  quedada_id: string;
  final_rank: number | null;
  joined_at: string;
  quedadas: {
    id: string;
    title: string;
    format: string;
    status: string;
    updated_at: string;
    starts_at: string;
  } | null;
};

export type QuedadaGameRow = GameForStandings & {
  quedada_id: string;
  updated_at?: string;
};

export function gameOutcomeForUser(
  game: GameForStandings,
  userId: string,
): "win" | "loss" | "tie" | null {
  if (game.status !== "played") return null;
  const onA = [game.side_a_p1, game.side_a_p2].includes(userId);
  const onB = [game.side_b_p1, game.side_b_p2].includes(userId);
  if (!onA && !onB) return null;
  const pa = game.points_a ?? 0;
  const pb = game.points_b ?? 0;
  if (pa === pb) return "tie";
  const aWon = pa > pb;
  if (onA) return aWon ? "win" : "loss";
  return aWon ? "loss" : "win";
}

function userInGame(game: GameForStandings, userId: string): boolean {
  return [game.side_a_p1, game.side_a_p2, game.side_b_p1, game.side_b_p2].includes(userId);
}

function finishMs(row: QuedadaParticipantRow): number {
  const q = row.quedadas;
  if (!q) return 0;
  const iso = q.updated_at || q.starts_at;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function computeQuedadaProfileStats(
  participants: QuedadaParticipantRow[],
  games: QuedadaGameRow[],
  userId: string,
): QuedadaProfileStats {
  const empty: QuedadaProfileStats = {
    finishedCount: 0,
    activeCount: 0,
    gamesPlayed: 0,
    gameWins: 0,
    gameWinRate: 0,
    podiums: { first: 0, second: 0, third: 0, total: 0 },
    podiumStreak: 0,
    winStreak: 0,
    recent: [],
  };
  if (participants.length === 0) return empty;

  const finished = participants.filter((p) => p.quedadas?.status === "finished");
  const active = participants.filter((p) => {
    const s = p.quedadas?.status;
    return s === "live" || s === "registration_closed" || s === "registration_open";
  });

  const finishedIds = new Set(finished.map((p) => p.quedada_id));
  const gamesByQuedada = new Map<string, QuedadaGameRow[]>();
  for (const g of games) {
    if (!finishedIds.has(g.quedada_id)) continue;
    const arr = gamesByQuedada.get(g.quedada_id) ?? [];
    arr.push(g);
    gamesByQuedada.set(g.quedada_id, arr);
  }

  let gamesPlayed = 0;
  let gameWins = 0;
  const gameOutcomes: { at: number; outcome: "win" | "loss" | "tie" }[] = [];

  for (const g of games) {
    if (!finishedIds.has(g.quedada_id)) continue;
    const outcome = gameOutcomeForUser(g, userId);
    if (!outcome) continue;
    gamesPlayed += 1;
    if (outcome === "win") gameWins += 1;
    const at = g.updated_at ? new Date(g.updated_at).getTime() : 0;
    gameOutcomes.push({ at: Number.isNaN(at) ? 0 : at, outcome });
  }

  let first = 0;
  let second = 0;
  let third = 0;
  for (const p of finished) {
    const r = p.final_rank;
    if (r === 1) first += 1;
    else if (r === 2) second += 1;
    else if (r === 3) third += 1;
  }

  const sortedFinished = [...finished].sort((a, b) => finishMs(b) - finishMs(a));
  let podiumStreak = 0;
  for (const p of sortedFinished) {
    const r = p.final_rank;
    if (r != null && r >= 1 && r <= 3) podiumStreak += 1;
    else break;
  }

  gameOutcomes.sort((a, b) => b.at - a.at);
  let winStreak = 0;
  for (const o of gameOutcomes) {
    if (o.outcome === "win") winStreak += 1;
    else if (o.outcome === "loss") break;
    else break;
  }

  const recent = sortedFinished.slice(0, 6).map((p) => {
    const qGames = (gamesByQuedada.get(p.quedada_id) ?? []).filter((g) => userInGame(g, userId));
    let gp = 0;
    let gw = 0;
    for (const g of qGames) {
      const o = gameOutcomeForUser(g, userId);
      if (!o) continue;
      gp += 1;
      if (o === "win") gw += 1;
    }
    return {
      quedadaId: p.quedada_id,
      title: p.quedadas?.title ?? "Quedada",
      format: p.quedadas?.format ?? "americano",
      finishedAt: p.quedadas?.updated_at ?? p.quedadas?.starts_at ?? p.joined_at,
      finalRank: p.final_rank,
      gamesPlayed: gp,
      gameWins: gw,
    };
  });

  return {
    finishedCount: finished.length,
    activeCount: active.length,
    gamesPlayed,
    gameWins,
    gameWinRate: gamesPlayed ? Math.round((gameWins / gamesPlayed) * 100) : 0,
    podiums: { first, second, third, total: first + second + third },
    podiumStreak,
    winStreak,
    recent,
  };
}

export { quedadaFormatLabel } from "./format-labels";

export function podiumRankLabel(rank: number | null): string | null {
  if (rank === 1) return "1°";
  if (rank === 2) return "2°";
  if (rank === 3) return "3°";
  return rank != null ? `${rank}°` : null;
}
