import { quedadaFormatLabel, quedadaFormatDescription } from "@/lib/quedadas/format-labels";
import type { GroupPlayoffConfig } from "@/lib/tournaments/group-stage";
import type { ScoringConfig } from "@/lib/schemas/tournaments";

export type ConfigRow = {
  label: string;
  value: string;
  hint?: string;
};

export function formatScoringConfig(cfg: ScoringConfig | null | undefined): string {
  if (!cfg) return "Por confirmar";
  const typeLabel = cfg.type === "rally" ? "Rally" : "Side-out";
  const bo = cfg.bestOf === 1 ? "1 game" : `Best of ${cfg.bestOf}`;
  return `${typeLabel} · ${bo} a ${cfg.points} (gana por ${cfg.winBy})`;
}

export function formatModality(modality: string | null | undefined): string {
  switch (modality) {
    case "singles":
      return "Singles";
    case "mixed_doubles":
      return "Mixto";
    case "doubles":
    default:
      return "Dobles";
  }
}

export function formatPaymentPolicy(policy: string | null | undefined): string {
  switch (policy) {
    case "free":
      return "Gratis";
    case "prepay":
      return "Online (transferencia)";
    case "onsite":
      return "En club";
    case "flexible":
      return "Flexible (tú eliges)";
    default:
      return "Por confirmar";
  }
}

export function formatTournamentFormat(format: string): string {
  switch (format) {
    case "single_elim":
      return "Eliminación directa";
    case "double_elim":
      return "Doble eliminación";
    case "round_robin":
      return "Todos contra todos";
    case "swiss":
      return "Sistema suizo";
    case "groups_to_knockout":
      return "Grupos + eliminatoria";
    default:
      return format;
  }
}

export function formatQuedadaFormat(format: string): string {
  return quedadaFormatLabel(format as Parameters<typeof quedadaFormatLabel>[0]);
}

export function formatMatchMode(mode: "singles" | "doubles"): string {
  return mode === "singles" ? "Singles (1 vs 1)" : "Dobles (2 vs 2)";
}

export function formatVisibility(v: "open" | "private"): string {
  return v === "private" ? "Privada (solo invitados)" : "Abierta";
}

export function formatMoneyCents(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return "Gratis";
  const n = cents / 100;
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export function formatGroupPlayoffConfig(cfg: GroupPlayoffConfig | null | undefined): string {
  if (!cfg?.groupsCount || !cfg?.advancePerGroup) return "Por confirmar";
  const total = cfg.groupsCount * cfg.advancePerGroup;
  return `${cfg.groupsCount} grupo${cfg.groupsCount === 1 ? "" : "s"} · clasifican ${cfg.advancePerGroup} por grupo → ${total} en llave`;
}

export function formatCategoryStage(stage: string | null | undefined): string {
  switch (stage) {
    case "pending_groups":
      return "Pendiente sorteo";
    case "group_stage":
      return "Fase de grupos";
    case "group_complete":
      return "Grupos cerrados";
    case "knockout":
      return "Eliminatoria";
    case "complete":
      return "Finalizada";
    default:
      return "—";
  }
}

export function formatMprRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min.toFixed(2)} – ${max.toFixed(2)} MPR`;
  if (min != null) return `${min.toFixed(2)}+ MPR`;
  return `Hasta ${max!.toFixed(2)} MPR`;
}

export function formatQuedadaStatus(status: string): { value: string; hint: string } {
  switch (status) {
    case "registration_open":
      return {
        value: "Inscripciones abiertas",
        hint: "Puedes unirte si hay cupo. El organizador publicará partidos cuando cierre inscripciones o arranque el evento.",
      };
    case "registration_closed":
      return {
        value: "Inscripciones cerradas",
        hint: "Ya no entran jugadores nuevos. Revisa Tu calendario cuando el organizador publique la primera ronda.",
      };
    case "live":
      return {
        value: "En curso",
        hint: "Hay partidos activos o programados. Mira Tu calendario, Por cancha o la Tabla según el formato.",
      };
    case "finished":
      return {
        value: "Finalizada",
        hint: "El evento terminó. Puedes revisar resultados y la tabla final si el formato la calcula.",
      };
    case "cancelled":
      return {
        value: "Cancelada",
        hint: "El organizador canceló esta quedada. No se jugarán partidos pendientes.",
      };
    default:
      return { value: status, hint: "Estado actual del evento en MATCHPOINT." };
  }
}

function scoringDetailHint(cfg: ScoringConfig | null | undefined): string {
  if (!cfg) return "El organizador confirmará las reglas antes del inicio.";
  const rally =
    cfg.type === "rally"
      ? "Rally: cualquier lado puede anotar en cada intercambio."
      : "Side-out: solo anota quien está sacando.";
  const games =
    cfg.bestOf === 1
      ? "Un solo game define el partido."
      : `Al mejor de ${cfg.bestOf} games; gana quien sume más victorias.`;
  return `${rally} Gana el game al llegar a ${cfg.points} con diferencia de ${cfg.winBy}. ${games}`;
}

function tournamentFormatHint(format: string): string {
  switch (format) {
    case "single_elim":
      return "Pierdes un partido y quedas fuera del cuadro. Avance directo hasta la final.";
    case "double_elim":
      return "Tienes una segunda oportunidad en bracket de perdedores antes de quedar eliminado.";
    case "round_robin":
      return "Todos los equipos se enfrentan entre sí; el ranking final define campeones.";
    case "swiss":
      return "Cada ronda empareja equipos con récord similar; no hay eliminación temprana.";
    case "groups_to_knockout":
      return "Primero fase de grupos; los mejores de cada zona pasan a eliminatoria.";
    default:
      return "Estructura del cuadro definida por el organizador.";
  }
}

function paymentPolicyHint(policy: string | null | undefined): string {
  switch (policy) {
    case "free":
      return "Sin costo de inscripción por MATCHPOINT.";
    case "prepay":
      return "Debes pagar online (transferencia u otro método) antes de quedar confirmado.";
    case "onsite":
      return "Pagas directamente en el club el día del torneo.";
    case "flexible":
      return "El organizador te indicará si conviene pagar antes o en sede.";
    default:
      return "Consulta con el organizador cómo se cobra la inscripción.";
  }
}

export function buildQuedadaConfigRows(input: {
  format: string;
  matchMode: "singles" | "doubles";
  visibility: "open" | "private";
  feeCents: number;
  targetPoints: number | null;
  status: string;
}): ConfigRow[] {
  const status = formatQuedadaStatus(input.status);
  const formatDesc = quedadaFormatDescription(input.format);
  const isDoubles = input.matchMode === "doubles";

  return [
    { label: "Estado", value: status.value, hint: status.hint },
    {
      label: "Formato de juego",
      value: formatQuedadaFormat(input.format),
      hint: formatDesc || "Cómo se arman las rondas y el ranking de la quedada.",
    },
    {
      label: "Modalidad",
      value: formatMatchMode(input.matchMode),
      hint: isDoubles
        ? "Cada game es 2 contra 2. En formatos de rotación, tu pareja y rivales cambian cada ronda."
        : "Cada game es 1 contra 1 y el ranking es individual.",
    },
    {
      label: "Puntuación",
      value: input.targetPoints ? `A ${input.targetPoints} puntos por game` : "Según el organizador",
      hint: input.targetPoints
        ? `Gana el game quien llegue primero a ${input.targetPoints} puntos (marcador acordado para todos los partidos salvo override por categoría).`
        : "El organizador puede definir el marcador por categoría o confirmarlo antes de empezar.",
    },
    {
      label: "Visibilidad",
      value: formatVisibility(input.visibility),
      hint:
        input.visibility === "private"
          ? "Solo quienes tienen invitación o enlace pueden ver la quedada e inscribirse."
          : "Visible en MATCHPOINT; cualquier jugador puede descubrirla e inscribirse si hay cupo.",
    },
    {
      label: "Cuota",
      value: formatMoneyCents(input.feeCents),
      hint:
        input.feeCents > 0
          ? "Monto informativo de inscripción. El cobro se coordina con el organizador o en el club, según el evento."
          : "Sin costo de inscripción registrado en la plataforma.",
    },
  ];
}

export function buildTournamentConfigRows(input: {
  format: string;
  modality: string | null;
  scoringConfig: ScoringConfig | null;
  paymentPolicy: string;
  entryFeeCents: number;
  maxParticipants: number | null;
  groupPlayoffFromCategories?: GroupPlayoffConfig | null;
}): ConfigRow[] {
  const rows: ConfigRow[] = [
    {
      label: "Estructura",
      value: formatTournamentFormat(input.format),
      hint: tournamentFormatHint(input.format),
    },
    {
      label: "Modalidad",
      value: formatModality(input.modality),
      hint:
        input.modality === "singles"
          ? "Partidos individuales 1 vs 1."
          : input.modality === "mixed_doubles"
            ? "Dobles mixtos: un hombre y una mujer por lado."
            : "Dobles clásicos: dos jugadores por equipo en cada partido.",
    },
    {
      label: "Sistema de puntuación",
      value: formatScoringConfig(input.scoringConfig),
      hint: scoringDetailHint(input.scoringConfig),
    },
    {
      label: "Pago",
      value: formatPaymentPolicy(input.paymentPolicy),
      hint: paymentPolicyHint(input.paymentPolicy),
    },
    {
      label: "Cuota de inscripción",
      value: formatMoneyCents(input.entryFeeCents),
      hint:
        input.entryFeeCents > 0
          ? "Precio por equipo o jugador según modalidad; confirma en Detalles si incluye premios."
          : "Inscripción gratuita en MATCHPOINT.",
    },
  ];
  if (input.maxParticipants) {
    rows.push({
      label: "Cupos",
      value: `${input.maxParticipants} equipos máximo`,
      hint: "Cuando se llena el cupo, las nuevas inscripciones quedan en lista de espera o se rechazan según el organizador.",
    });
  }
  if (input.format === "groups_to_knockout" && input.groupPlayoffFromCategories) {
    rows.push({
      label: "Fase de grupos",
      value: formatGroupPlayoffConfig(input.groupPlayoffFromCategories),
      hint: "Los mejores de cada grupo pasan a la eliminatoria según esta config.",
    });
    const finalOverride = input.groupPlayoffFromCategories.finalScoringOverride;
    if (finalOverride) {
      rows.push({
        label: "Final",
        value: formatScoringConfig(finalOverride),
        hint: "La final puede usar un scoring distinto al resto del torneo.",
      });
    }
  }
  return rows;
}
