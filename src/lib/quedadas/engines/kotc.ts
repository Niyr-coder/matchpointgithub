import type { QuedadaEngine, RoundPlan } from "../types";
import { draftFromTeams, fixedTeamsFromPairs, nextRoundNo, playersFromPairs } from "./shared";

export const kotcEngine: QuedadaEngine = {
  format: "kotc",
  label: "Rey de Cancha",
  rosterMode: (mode) => (mode === "singles" ? "individual" : "fixed_pairs"),
  standingsMode: (mode) => (mode === "singles" ? "individual" : "pair"),
  canGenerateRound: true,
  canManualGame: false,
  roundLabel: "Turno",
  tableEntityLabel: "Equipo",
  planNextRound: ({ pairs, prior, mode, courts }): RoundPlan | null => {
    const teams = mode === "singles" ? playersFromPairs(pairs).map((p) => [p]) : fixedTeamsFromPairs(pairs, mode);
    if (teams.length < 2) return null;
    // MVP: orden de cancha por último rendimiento; ganador tiende a quedar arriba.
    const score = new Map<string, number>();
    for (const g of prior) {
      if (g.status !== "played") continue;
      const a = [g.side_a_p1, g.side_a_p2].filter((x): x is string => !!x).join("|");
      const b = [g.side_b_p1, g.side_b_p2].filter((x): x is string => !!x).join("|");
      if ((g.points_a ?? 0) > (g.points_b ?? 0)) score.set(a, (score.get(a) ?? 0) + 1);
      if ((g.points_b ?? 0) > (g.points_a ?? 0)) score.set(b, (score.get(b) ?? 0) + 1);
    }
    const ranked = teams.slice().sort((a, b) => (score.get(b.join("|")) ?? 0) - (score.get(a.join("|")) ?? 0));
    const games = draftFromTeams(ranked.slice(0, Math.floor(ranked.length / 2) * 2), courts);
    return games.length ? { roundNo: nextRoundNo(prior), games, byes: ranked.slice(games.length * 2).flat() } : null;
  },
};
