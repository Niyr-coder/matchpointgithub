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
  /**
   * Nombre de fase de una ronda (formatos con etapas, ej. Modo Torneo:
   * "Fase de grupos · Fecha 2" / "Semifinales" / "Final"). null = usar el
   * label genérico `roundLabel N`.
   */
  roundNameFor?: (ctx: EngineContext, roundNo: number) => string | null;
  /**
   * Podio propio del formato (ej. Modo Torneo: lo definen final y bronce, no
   * la tabla). Devuelve los equipos rankeados (ids de jugador por puesto) o
   * null si aún no se puede decidir; sin este hook se usa la tabla derivada.
   */
  podium?: (ctx: EngineContext) => string[][] | null;
};
