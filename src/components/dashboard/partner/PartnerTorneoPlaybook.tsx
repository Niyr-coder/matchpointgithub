"use client";

import { Icon } from "@/components/Icon";

export type PlaybookCategory = {
  id: string;
  name: string;
  stage: string;
  acceptedCount: number;
  groupsCount: number;
};

export type GroupMatchStats = {
  pending: number;
  awaitingConfirm: number;
  confirmed: number;
  total: number;
};

type StepState = "done" | "current" | "upcoming" | "blocked";

type Step = {
  id: string;
  label: string;
  detail: string;
  state: StepState;
};

function stepIcon(state: StepState): string {
  if (state === "done") return "check";
  if (state === "current") return "arrow-right";
  if (state === "blocked") return "alert-triangle";
  return "circle";
}

function buildGroupSteps(
  status: string,
  pendingRegCount: number,
  categories: PlaybookCategory[],
  hasBracket: boolean,
  matchStats: GroupMatchStats | null,
  clubCourtsCount: number,
): Step[] {
  const regClosed =
    status === "registration_closed" ||
    status === "active" ||
    status === "in_progress" ||
    status === "finished" ||
    status === "completed";

  const allConfigDone = categories.every((c) => c.stage !== "pending_groups");
  const allEnoughRegs = categories.every((c) => c.acceptedCount >= c.groupsCount);
  const anyInGroups = categories.some(
    (c) => c.stage === "group_stage" || c.stage === "group_complete" || c.stage === "knockout",
  );
  const allGroupsClosed = categories.every(
    (c) => c.stage === "group_complete" || c.stage === "knockout" || c.stage === "complete",
  );
  const anyKnockout = categories.some((c) => c.stage === "knockout" || c.stage === "complete");

  const matchesDone =
    matchStats != null && matchStats.total > 0 && matchStats.confirmed === matchStats.total;
  const matchesInProgress =
    matchStats != null &&
    matchStats.total > 0 &&
    matchStats.confirmed < matchStats.total &&
    categories.some((c) => c.stage === "group_stage");

  const steps: Step[] = [
    {
      id: "config",
      label: "Guardar formato competitivo",
      detail: allConfigDone
        ? "Config bloqueada tras el sorteo."
        : "Tab Configuración: grupos, clasificados y extras antes del sorteo.",
      state: allConfigDone ? "done" : "current",
    },
    {
      id: "regs",
      label: "Inscripciones aceptadas",
      detail: allEnoughRegs
        ? pendingRegCount > 0
          ? `${pendingRegCount} pendiente${pendingRegCount === 1 ? "" : "s"} por revisar.`
          : "Cupos mínimos por categoría listos."
        : "Acepta inscritos hasta cubrir al menos 1 por grupo en cada categoría.",
      state: allEnoughRegs ? "done" : allConfigDone ? "current" : "upcoming",
    },
    {
      id: "close-regs",
      label: "Cerrar inscripciones",
      detail: regClosed
        ? "Inscripciones cerradas."
        : "Recomendado antes del sorteo para evitar cambios de cupo.",
      state: regClosed ? "done" : allEnoughRegs ? "current" : "upcoming",
    },
    {
      id: "draw",
      label: "Programar canchas y sortear",
      detail: allConfigDone
        ? clubCourtsCount === 0
          ? "Grupos sorteados (sin canchas del club)."
          : "Grupos sorteados y calendario generado."
        : clubCourtsCount === 0
          ? "Elige canchas en Operación (si hay) y sortea grupos."
          : "Operación: canchas activas → Sortear grupos.",
      state: allConfigDone ? "done" : regClosed || allEnoughRegs ? "current" : "upcoming",
    },
    {
      id: "scores",
      label: "Confirmar todos los marcadores",
      detail: matchesDone
        ? "Todos los partidos de grupos confirmados."
        : matchesInProgress
          ? `${matchStats!.awaitingConfirm} por confirmar · ${matchStats!.pending} por jugar. Solo cuentan los confirmados.`
          : anyInGroups
            ? "Reporta resultado y pulsa Confirmar en cada partido."
            : "Disponible cuando empiece la fase de grupos.",
      state: matchesDone || allGroupsClosed ? "done" : matchesInProgress || anyInGroups ? "current" : "upcoming",
    },
    {
      id: "close-groups",
      label: "Cerrar fase de grupos",
      detail: allGroupsClosed
        ? "Clasificados calculados."
        : matchesInProgress
          ? "Bloqueado hasta confirmar todos los partidos."
          : "Operación → Cerrar fase de grupos (por categoría).",
      state: allGroupsClosed
        ? "done"
        : matchesDone && categories.some((c) => c.stage === "group_stage")
          ? "current"
          : matchesInProgress
            ? "blocked"
            : "upcoming",
    },
    {
      id: "bracket",
      label: "Generar cuadro eliminatorio",
      detail: anyKnockout || hasBracket
        ? "Llave creada."
        : allGroupsClosed
          ? "Operación → Generar cuadro final."
          : "Disponible tras cerrar grupos.",
      state: anyKnockout || hasBracket ? "done" : allGroupsClosed ? "current" : "upcoming",
    },
  ];

  return steps;
}

export function PartnerTorneoPlaybook({
  format,
  status,
  pendingRegCount,
  categories,
  hasBracket,
  matchStats,
  clubCourtsCount,
}: {
  format: string;
  status: string;
  pendingRegCount: number;
  categories: PlaybookCategory[];
  hasBracket: boolean;
  matchStats: GroupMatchStats | null;
  clubCourtsCount: number;
}) {
  if (format !== "groups_to_knockout" || categories.length === 0) return null;

  const steps = buildGroupSteps(
    status,
    pendingRegCount,
    categories,
    hasBracket,
    matchStats,
    clubCourtsCount,
  );
  const current = steps.find((s) => s.state === "current" || s.state === "blocked");

  return (
    <div className="card mp-partner-torneo-playbook">
      <div className="label-mp">Guía de operación</div>
      {current && (
        <p className="mp-partner-torneo-playbook-now">
          Ahora: <b>{current.label}</b>
        </p>
      )}
      <ol className="mp-partner-torneo-playbook-steps">
        {steps.map((s) => (
          <li
            key={s.id}
            className={`mp-partner-torneo-playbook-step is-${s.state}`}
          >
            <span className="mp-partner-torneo-playbook-step-icon" aria-hidden>
              <Icon
                name={stepIcon(s.state)}
                size={12}
                color={
                  s.state === "done"
                    ? "var(--primary)"
                    : s.state === "blocked"
                      ? "#dc2626"
                      : s.state === "current"
                        ? "#fff"
                        : "var(--muted-fg)"
                }
              />
            </span>
            <span className="mp-partner-torneo-playbook-step-body">
              <b>{s.label}</b>
              <small>{s.detail}</small>
            </span>
          </li>
        ))}
      </ol>
      <div className="mp-partner-torneo-playbook-tips">
        <b>Evita errores comunes</b>
        <ul>
          <li>Mejores terceros ≠ partido de bronce: uno mete equipos extra a la llave; el otro es podio tras semifinal.</li>
          <li>La tabla de posiciones solo cuenta partidos <em>confirmados</em>, no los reportados.</li>
          <li>Tras sortear grupos no puedes cambiar el formato competitivo.</li>
        </ul>
      </div>
    </div>
  );
}
