import type { TournamentDetail } from "@/lib/schemas/tournaments";

export type TorneoPlayerFormat = "bracket" | "grupos" | "liga";
export type TorneoPlayerStatus = "open" | "live" | "finished";

export function mapTournamentFormatToPlayerView(format: string): TorneoPlayerFormat {
  if (format === "groups_to_knockout") return "grupos";
  if (format === "round_robin" || format === "swiss") return "liga";
  return "bracket";
}

export function mapTournamentStatusToPlayerView(status: string): TorneoPlayerStatus {
  if (status === "finished" || status === "completed" || status === "cancelled") return "finished";
  if (status === "active" || status === "in_progress" || status === "registration_closed") return "live";
  return "open";
}

export function formatLabelForPlayerView(format: TorneoPlayerFormat): string {
  if (format === "grupos") return "Grupos + Playoff";
  if (format === "liga") return "Round-robin";
  return "Eliminación directa";
}

export function playerStatusLabel(tournamentStatus: string, registrationStatus: string | null): string {
  const regLabel =
    registrationStatus === "pending"
      ? "Inscripción pendiente"
      : registrationStatus
        ? "Inscrito"
        : "Vista jugador";

  const statusLabel: Record<string, string> = {
    draft: "Borrador",
    published: "Publicado",
    registration_open: "Inscripciones abiertas",
    registration_closed: "Inscripciones cerradas",
    live: "En curso",
    finished: "Finalizado",
    cancelled: "Cancelado",
    active: "En curso",
    in_progress: "En curso",
    completed: "Finalizado",
  };

  return `${regLabel} · ${statusLabel[tournamentStatus] ?? tournamentStatus}`;
}

const TAB_LABELS: Record<TorneoPlayerFormat, { camino: string; completo: string }> = {
  bracket: { camino: "Tu camino", completo: "Bracket" },
  grupos: { camino: "Tu camino", completo: "Grupo A" },
  liga: { camino: "Tu próxima jornada", completo: "Tabla de la liga" },
};

export function playerTabLabels(format: TorneoPlayerFormat) {
  return TAB_LABELS[format];
}

export function completoTabIcon(format: TorneoPlayerFormat): string {
  if (format === "bracket") return "git-fork";
  if (format === "grupos") return "columns-3";
  return "list-ordered";
}

export type TorneoPlayerShell = {
  title: string;
  format: TorneoPlayerFormat;
  status: TorneoPlayerStatus;
  dateLabel: string;
  locationText: string;
  matchModeLabel: string;
  feeLabel: string;
  statusLabel: string;
};

function formatDateLabel(startsAt: string): string {
  const d = new Date(startsAt);
  const day = d.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

function formatFee(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return "Gratis";
  return `$${(cents / 100).toFixed(2)}`;
}

export function buildTorneoPlayerShell(
  detail: TournamentDetail,
  clubName: string | null,
  registrationStatus: string | null,
): TorneoPlayerShell {
  const { tournament: t } = detail;
  const format = mapTournamentFormatToPlayerView(t.format);
  return {
    title: t.name,
    format,
    status: mapTournamentStatusToPlayerView(t.status),
    dateLabel: formatDateLabel(t.startsAt),
    locationText: clubName ?? "Por confirmar",
    matchModeLabel: t.modality === "singles" ? "Singles" : "Dobles",
    feeLabel: formatFee(t.entryFeeCents),
    statusLabel: playerStatusLabel(t.status, registrationStatus),
  };
}
