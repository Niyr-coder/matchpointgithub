/** Kill switch global de sorteos v2 (feed del club, mis sorteos, panel org). */
export const CLUB_GIVEAWAYS_FLAG = "club_giveaways_enabled";

/** Ausente en el mapa = encendido (comportamiento legacy). */
export function isClubGiveawaysEnabled(flags: Record<string, boolean>): boolean {
  return flags[CLUB_GIVEAWAYS_FLAG] !== false;
}
