/** Etiqueta de tipo de evento según formato (no confundir con torneo estelar de portada). */
export function tournamentFormatBadge(format: string, uppercase = false): string {
  let label: string;
  if (format === "round_robin" || format === "swiss") label = "Liga";
  else if (format === "groups_to_knockout") label = "Grupos";
  else label = "Torneo";
  return uppercase ? label.toUpperCase() : label;
}
