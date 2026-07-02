export type TournamentRegistrationBlock =
  | "cancelled"
  | "finished"
  | "closed"
  | "live"
  | "not_open"
  | "past_close"
  | "full";

export type TournamentRegistrationEligibility = {
  canRegister: boolean;
  block: TournamentRegistrationBlock | null;
  label: string;
  /** true = está lleno pero el torneo permite lista de espera (CTA distinto). */
  waitlistAvailable?: boolean;
};

type Input = {
  status: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  maxParticipants: number | null;
  allowWaitlist?: boolean;
  registrationCount: number;
  categories: Array<{ id: string; maxTeams: number | null }>;
  categoryRegistrationCounts: Record<string, number>;
  now?: Date;
};

const OPEN_STATUSES = new Set(["registration_open", "published"]);

export function getTournamentRegistrationEligibility(input: Input): TournamentRegistrationEligibility {
  const now = input.now ?? new Date();
  const status = input.status;

  if (status === "cancelled") {
    return { canRegister: false, block: "cancelled", label: "Torneo cancelado" };
  }
  if (status === "finished" || status === "completed") {
    return { canRegister: false, block: "finished", label: "Torneo finalizado" };
  }
  if (status === "registration_closed") {
    return { canRegister: false, block: "closed", label: "Inscripciones cerradas" };
  }
  if (status === "live") {
    return { canRegister: false, block: "live", label: "Torneo en curso" };
  }
  if (!OPEN_STATUSES.has(status)) {
    return { canRegister: false, block: "closed", label: "Inscripciones cerradas" };
  }

  if (input.registrationOpensAt && new Date(input.registrationOpensAt) > now) {
    return { canRegister: false, block: "not_open", label: "Inscripciones próximamente" };
  }
  if (input.registrationClosesAt && new Date(input.registrationClosesAt) < now) {
    return { canRegister: false, block: "past_close", label: "Inscripciones cerradas" };
  }

  // Lleno: si el torneo permite lista de espera, se puede "inscribir" igual
  // (el server encola con status='waitlist'); el CTA cambia de copy.
  const fullResult: TournamentRegistrationEligibility = input.allowWaitlist
    ? { canRegister: true, block: "full", label: "Lista de espera disponible", waitlistAvailable: true }
    : { canRegister: false, block: "full", label: "Cupos llenos" };

  const max = input.maxParticipants;
  if (max != null && max > 0 && input.registrationCount >= max) {
    return fullResult;
  }

  if (input.categories.length > 0) {
    const hasOpenCategory = input.categories.some((c) => {
      const cap = c.maxTeams;
      if (cap == null || cap <= 0) return true;
      const taken = input.categoryRegistrationCounts[c.id] ?? 0;
      return taken < cap;
    });
    if (!hasOpenCategory) {
      return fullResult;
    }
  }

  return { canRegister: true, block: null, label: "" };
}
