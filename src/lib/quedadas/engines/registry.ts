import type { QuedadaFormat } from "@/lib/schemas/quedadas";
import type { QuedadaEngine, QuedadaMatchMode, QuedadaRosterMode, QuedadaStandingsMode } from "../types";
import { americanoEngine } from "./americano";
import { canguilEngine } from "./canguil";
import { kotcEngine } from "./kotc";
import { libreEngine } from "./libre";
import { mexicanoEngine } from "./mexicano";
import { roundRobinEngine } from "./round-robin";
import { torneoEngine } from "./torneo";

const ENGINES: Record<QuedadaFormat, QuedadaEngine> = {
  americano: americanoEngine,
  mexicano: mexicanoEngine,
  round_robin: roundRobinEngine,
  kotc: kotcEngine,
  canguil: canguilEngine,
  libre: libreEngine,
  torneo: torneoEngine,
};

export function getQuedadaEngine(format: string): QuedadaEngine {
  const key = format as QuedadaFormat;
  return Object.prototype.hasOwnProperty.call(ENGINES, key) ? ENGINES[key] : americanoEngine;
}

export function rosterModeFor(format: string, mode: QuedadaMatchMode): QuedadaRosterMode {
  return getQuedadaEngine(format).rosterMode(mode);
}

export function standingsModeFor(format: string, mode: QuedadaMatchMode): QuedadaStandingsMode {
  return getQuedadaEngine(format).standingsMode(mode);
}

export function allQuedadaEngines(): QuedadaEngine[] {
  return Object.values(ENGINES);
}
