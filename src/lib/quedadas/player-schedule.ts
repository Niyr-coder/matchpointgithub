import type { GameViewGame, QuedadaPlayerViewData } from "./game-view-types";

export function sideIds(game: GameViewGame, side: "a" | "b"): string[] {
  return side === "a"
    ? [game.side_a_p1, game.side_a_p2].filter((id): id is string => !!id)
    : [game.side_b_p1, game.side_b_p2].filter((id): id is string => !!id);
}

export function includesUser(game: GameViewGame, userId: string): boolean {
  return [...sideIds(game, "a"), ...sideIds(game, "b")].includes(userId);
}

export function gameOrder(a: GameViewGame, b: GameViewGame): number {
  return (a.round_no ?? 9999) - (b.round_no ?? 9999) || (a.court_no ?? 9999) - (b.court_no ?? 9999);
}

export function myCategoryIds(data: QuedadaPlayerViewData): Set<string> {
  const ids = new Set<string>();
  for (const p of data.pairs) {
    if (p.player_a_id === data.meUserId || p.player_b_id === data.meUserId) ids.add(p.category_id);
  }
  return ids;
}

export function myGames(data: QuedadaPlayerViewData): GameViewGame[] {
  return data.games.filter((g) => includesUser(g, data.meUserId)).sort(gameOrder);
}

export function nextGameForPlayer(data: QuedadaPlayerViewData): GameViewGame | null {
  return myGames(data).find((g) => g.status !== "played") ?? null;
}

/** Rondas de la categoría del jugador (union rounds + games). */
export function roundNumbersForPlayer(data: QuedadaPlayerViewData): number[] {
  const catIds = myCategoryIds(data);
  const fromRounds = data.rounds
    .filter((r) => catIds.size === 0 || catIds.has(r.category_id))
    .map((r) => r.round_no)
    .filter((n): n is number => Number.isFinite(n));
  const fromGames = myGames(data)
    .map((g) => g.round_no)
    .filter((n): n is number => n != null);
  return [...new Set([...fromRounds, ...fromGames])].sort((a, b) => a - b);
}

/** Byes del jugador = rondas de su categoría sin partido asignado. */
export function restRoundsForPlayer(data: QuedadaPlayerViewData): number {
  const rounds = roundNumbersForPlayer(data);
  const mine = myGames(data);
  return rounds.filter((roundNo) => !mine.some((g) => g.round_no === roundNo)).length;
}

export function mySide(game: GameViewGame, meUserId: string): "a" | "b" {
  return sideIds(game, "a").includes(meUserId) ? "a" : "b";
}

export function scoreForUser(
  game: GameViewGame,
  meUserId: string,
): { mine: number | null; theirs: number | null; won: boolean | null } {
  const side = mySide(game, meUserId);
  const mine = side === "a" ? game.points_a : game.points_b;
  const theirs = side === "a" ? game.points_b : game.points_a;
  if (mine == null || theirs == null) return { mine, theirs, won: null };
  return { mine, theirs, won: mine > theirs };
}
