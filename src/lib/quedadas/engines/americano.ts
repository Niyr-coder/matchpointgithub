import { planAmericanoRound } from "../americano";
import { quedadaFormatLabel } from "../format-labels";
import type { QuedadaEngine } from "../types";
import { playersFromPairs } from "./shared";

export const americanoEngine: QuedadaEngine = {
  format: "americano",
  label: quedadaFormatLabel("americano"),
  rosterMode: () => "individual",
  standingsMode: () => "individual",
  canGenerateRound: true,
  canManualGame: false,
  roundLabel: "Ronda",
  tableEntityLabel: "Jugador",
  planNextRound: ({ pairs, prior, mode, courts }) =>
    planAmericanoRound(playersFromPairs(pairs), prior, mode, courts),
};
