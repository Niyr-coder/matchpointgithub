/** Cuándo bloquear edición de setup (nombre, cupos, categorías, cronograma, premios). */

export const CATEGORY_COMPETITIVE_STAGES = [
  "group_stage",
  "group_complete",
  "knockout",
  "complete",
] as const;

export type TournamentSetupLockInput = {
  status: string;
  hasBracket?: boolean;
  categoryStages?: Array<string | null | undefined>;
};

export function isTournamentSetupLocked(input: TournamentSetupLockInput): boolean {
  const { status, hasBracket, categoryStages = [] } = input;

  if (status === "finished" || status === "cancelled" || status === "completed") {
    return true;
  }
  if (status === "live") return true;
  if (hasBracket) return true;
  if (
    categoryStages.some(
      (stage) =>
        stage != null &&
        (CATEGORY_COMPETITIVE_STAGES as readonly string[]).includes(stage),
    )
  ) {
    return true;
  }
  return false;
}

export function tournamentSetupLockMessage(input: TournamentSetupLockInput): string | null {
  if (!isTournamentSetupLocked(input)) return null;

  const { status, hasBracket, categoryStages = [] } = input;

  if (status === "cancelled") {
    return "Este torneo está cancelado y ya no se puede editar.";
  }
  if (status === "finished" || status === "completed") {
    return "Este torneo ya finalizó y ya no se puede editar.";
  }
  if (status === "live") {
    return "El torneo está en curso. La configuración quedó congelada.";
  }
  if (hasBracket) {
    return "Ya hay un cuadro eliminatorio. No puedes cambiar la configuración del torneo.";
  }
  if (
    categoryStages.some(
      (stage) =>
        stage != null &&
        (CATEGORY_COMPETITIVE_STAGES as readonly string[]).includes(stage),
    )
  ) {
    return "La competencia ya comenzó (fase de grupos o eliminatoria). No puedes cambiar la configuración.";
  }
  return "La configuración del torneo ya no se puede modificar.";
}
