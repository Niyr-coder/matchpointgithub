import type { GiveawayMechanicConfig } from "@/lib/giveaways/mechanics";

/** v11: calificar = cumplir todas las mecánicas activas → 1 entrada en el pool. */
export function isGiveawayQualified(
  enabledMechanics: GiveawayMechanicConfig[],
  doneKinds: Set<string>,
): boolean {
  if (enabledMechanics.length === 0) return true;
  return enabledMechanics.every((m) => doneKinds.has(m.kind));
}

export function qualifiedProbabilityPct(qualified: boolean, qualifierCount: number): number {
  if (!qualified || qualifierCount <= 0) return 0;
  return (1 / qualifierCount) * 100;
}
