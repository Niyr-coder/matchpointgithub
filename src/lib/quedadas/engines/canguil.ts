import type { QuedadaEngine, RoundPlan } from "../types";
import { draftFromTeams, nextRoundNo, playersFromPairs, shuffle } from "./shared";

export const canguilEngine: QuedadaEngine = {
  format: "canguil",
  label: "Canguil",
  rosterMode: () => "individual",
  standingsMode: () => "individual",
  canGenerateRound: true,
  canManualGame: false,
  roundLabel: "Ronda",
  tableEntityLabel: "Jugador",
  planNextRound: ({ pairs, prior, mode, courts }): RoundPlan | null => {
    const perGame = mode === "singles" ? 2 : 4;
    const players = shuffle(playersFromPairs(pairs));
    if (players.length < perGame) return null;
    const gamesCount = Math.max(1, Math.min(courts > 0 ? courts : players.length, Math.floor(players.length / perGame)));
    const active = players.slice(0, gamesCount * perGame);
    const byes = players.slice(gamesCount * perGame);
    const teams = mode === "singles"
      ? active.map((p) => [p])
      : Array.from({ length: Math.floor(active.length / 2) }, (_, i) => [active[i * 2], active[i * 2 + 1]]);
    return { roundNo: nextRoundNo(prior), games: draftFromTeams(teams, courts), byes };
  },
};
