import { quedadaFormatLabel } from "../format-labels";
import type { QuedadaEngine } from "../types";

export const libreEngine: QuedadaEngine = {
  format: "libre",
  label: quedadaFormatLabel("libre"),
  rosterMode: (mode) => (mode === "singles" ? "individual" : "fixed_pairs"),
  standingsMode: () => "manual",
  canGenerateRound: false,
  canManualGame: true,
  roundLabel: "Partido",
  tableEntityLabel: "Jugador",
  planNextRound: () => null,
};
