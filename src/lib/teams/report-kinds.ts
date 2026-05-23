// Catálogo de razones de reportes de teams (mig 166).
// Vive fuera de "use server" para poder exportar el label helper síncrono.

export const TEAM_REPORT_KINDS = ["name", "captain", "ghost", "logo", "other"] as const;
export type TeamReportKind = (typeof TEAM_REPORT_KINDS)[number];

export const TEAM_REPORT_KIND_LABEL: Record<TeamReportKind, string> = {
  name: "Nombre inapropiado",
  captain: "Capitán inactivo",
  ghost: "Team fantasma (sin actividad)",
  logo: "Logo / marca registrada",
  other: "Otro",
};

export function teamReportKindLabel(k: string): string {
  return (TEAM_REPORT_KIND_LABEL as Record<string, string>)[k] ?? k;
}
