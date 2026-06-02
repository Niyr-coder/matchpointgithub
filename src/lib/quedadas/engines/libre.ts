import type { QuedadaEngine } from "../types";

export const libreEngine: QuedadaEngine = {
  format: "libre",
  label: "Libre",
  rosterMode: (mode) => (mode === "singles" ? "individual" : "fixed_pairs"),
  standingsMode: () => "manual",
  canGenerateRound: false,
  canManualGame: true,
  roundLabel: "Partido",
  tableEntityLabel: "Jugador",
  planNextRound: () => null,
};
