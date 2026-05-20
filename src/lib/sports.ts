// Fuente única de la lista de deportes de la plataforma.
// Pickleball es el deporte primario. El switch `multisport` (platform_config
// multisport_enabled, mig 123) decide si Pádel y Tenis están disponibles.
//
// Client-safe: NO importa nada de server. El valor de `multisport` se inyecta
// vía SportsProvider (sembrado en el root layout con fn_multisport_enabled).
// Ver docs/product/05-multisport.md.

export type Sport = "pickleball" | "padel" | "tennis";

export const PRIMARY_SPORT: Sport = "pickleball";

// Orden canónico: el primario primero.
export const ALL_SPORTS: Sport[] = ["pickleball", "padel", "tennis"];

export const SPORT_META: Record<Sport, { label: string; emoji: string }> = {
  pickleball: { label: "Pickleball", emoji: "🥒" },
  padel: { label: "Pádel", emoji: "🎾" },
  tennis: { label: "Tenis", emoji: "🎾" },
};

export function sportLabel(sport: string): string {
  return (SPORT_META as Record<string, { label: string }>)[sport]?.label ?? sport;
}

// Deportes habilitados según el switch. multisport=false → solo Pickleball.
export function enabledSports(multisport: boolean): Sport[] {
  return multisport ? ALL_SPORTS : [PRIMARY_SPORT];
}
