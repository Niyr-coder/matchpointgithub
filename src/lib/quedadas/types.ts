import type { QuedadaFormat } from "@/lib/schemas/quedadas";

export type QuedadaRosterMode = "individual" | "fixed_pairs";
export type QuedadaStandingsMode = "individual" | "pair" | "manual";
export type QuedadaMatchMode = "singles" | "doubles";

export type EnginePriorGame = {
  round_no: number;
  side_a_p1: string;
  side_a_p2: string | null;
  side_b_p1: string;
  side_b_p2: string | null;
  points_a?: number | null;
  points_b?: number | null;
  status?: string;
};

export type EnginePair = {
  id: string;
  slot_no: number;
  player_a_id: string;
  player_b_id: string | null;
};

export type DraftGame = {
  courtNo: number | null;
  sideA: string[];
  sideB: string[];
};

export type RoundPlan = {
  roundNo: number;
  games: DraftGame[];
  byes: string[];
};

export type EngineContext = {
  pairs: EnginePair[];
  prior: EnginePriorGame[];
  mode: QuedadaMatchMode;
  courts: number;
  nameOf?: (userId: string) => string;
};

export type QuedadaEngine = {
  format: QuedadaFormat;
  label: string;
  rosterMode: (mode: QuedadaMatchMode) => QuedadaRosterMode;
  standingsMode: (mode: QuedadaMatchMode) => QuedadaStandingsMode;
  canGenerateRound: boolean;
  canManualGame: boolean;
  roundLabel: string;
  tableEntityLabel: string;
  planNextRound: (ctx: EngineContext) => RoundPlan | null;
};
