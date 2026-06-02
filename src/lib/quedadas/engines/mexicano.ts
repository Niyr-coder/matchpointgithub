import { individualStandings } from "../standings";
import type { QuedadaEngine, RoundPlan } from "../types";
import { draftFromTeams, nextRoundNo, playersFromPairs } from "./shared";

export const mexicanoEngine: QuedadaEngine = {
  format: "mexicano",
  label: "Mexicano",
  rosterMode: () => "individual",
  standingsMode: () => "individual",
  canGenerateRound: true,
  canManualGame: false,
  roundLabel: "Ronda",
  tableEntityLabel: "Jugador",
  planNextRound: ({ pairs, prior, mode, courts, nameOf }): RoundPlan | null => {
    const perGame = mode === "singles" ? 2 : 4;
    const players = playersFromPairs(pairs);
    if (players.length < perGame) return null;
    const standings = individualStandings(
      prior.map((g) => ({
        ...g,
        points_a: g.points_a ?? null,
        points_b: g.points_b ?? null,
        status: g.status ?? "scheduled",
      })),
      players,
      nameOf,
    );
    const ranked = standings.length > 0 ? standings.map((r) => r.userId) : players.slice().sort();
    const gamesCount = Math.max(1, Math.min(courts > 0 ? courts : ranked.length, Math.floor(ranked.length / perGame)));
    const active = ranked.slice(0, gamesCount * perGame);
    const byes = ranked.slice(gamesCount * perGame);
    const teams = mode === "singles"
      ? active.map((p) => [p])
      : Array.from({ length: Math.floor(active.length / 2) }, (_, i) => [active[i * 2], active[i * 2 + 1]]);
    return { roundNo: nextRoundNo(prior), games: draftFromTeams(teams, courts), byes };
  },
};
