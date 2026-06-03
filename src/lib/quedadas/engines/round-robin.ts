import { quedadaFormatLabel } from "../format-labels";
import type { QuedadaEngine, RoundPlan } from "../types";
import { fixedTeamsFromPairs, matchupKey, nextRoundNo } from "./shared";

export const roundRobinEngine: QuedadaEngine = {
  format: "round_robin",
  label: quedadaFormatLabel("round_robin"),
  rosterMode: (mode) => (mode === "singles" ? "individual" : "fixed_pairs"),
  standingsMode: (mode) => (mode === "singles" ? "individual" : "pair"),
  canGenerateRound: true,
  canManualGame: false,
  roundLabel: "Fecha",
  tableEntityLabel: "Pareja",
  planNextRound: ({ pairs, prior, mode, courts }): RoundPlan | null => {
    const teams = fixedTeamsFromPairs(pairs, mode);
    if (teams.length < 2) return null;
    const played = new Set(
      prior.map((g) =>
        matchupKey(
          [g.side_a_p1, g.side_a_p2].filter((x): x is string => !!x),
          [g.side_b_p1, g.side_b_p2].filter((x): x is string => !!x),
        ),
      ),
    );
    const used = new Set<string>();
    const games = [];
    const roundNo = nextRoundNo(prior);
    for (let i = 0; i < teams.length; i++) {
      const a = teams[i];
      const ak = a.join("|");
      if (used.has(ak)) continue;
      for (let j = i + 1; j < teams.length; j++) {
        const b = teams[j];
        const bk = b.join("|");
        if (used.has(bk) || played.has(matchupKey(a, b))) continue;
        games.push({ courtNo: courts > 0 ? (games.length % courts) + 1 : games.length + 1, sideA: a, sideB: b });
        used.add(ak);
        used.add(bk);
        break;
      }
    }
    if (games.length === 0) return null;
    const byes = teams.filter((t) => !used.has(t.join("|"))).flat();
    return { roundNo, games, byes };
  },
};
