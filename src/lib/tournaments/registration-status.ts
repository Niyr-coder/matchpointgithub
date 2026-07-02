// Semántica canónica de conteo de inscripciones de torneo.
//
// Regla (audit 2026-07-01): un inscrito "cuenta" (consume cupo, aparece en
// KPIs, barras de ocupación y listas públicas) SOLO si su status es pending o
// accepted. waitlist NO cuenta (no consume cupo — se muestra aparte);
// withdrawn/rejected NUNCA cuentan. El bug histórico de doble conteo
// (cancelar + re-inscribirse = 2) venía de filtros `.not("status","in",
// "(withdrawn,rejected,cancelled)")` — 'cancelled' ni siquiera existe en el
// enum y ese filtro incluye waitlist y cualquier status futuro.
//
// Usar SIEMPRE estas constantes en counts nuevos; no re-tipear listas.

/** Statuses que cuentan como inscripción activa (consumen cupo). */
export const ACTIVE_REGISTRATION_STATUSES = ["pending", "accepted"] as const;

/** Copia mutable para PostgREST .in("status", ...) que exige string[]. */
export const ACTIVE_REGISTRATION_STATUS_LIST: string[] = [...ACTIVE_REGISTRATION_STATUSES];

/** ¿Este status cuenta como inscrito? (para conteos in-memory sobre filas ya cargadas) */
export function countsAsRegistered(status: string | null | undefined): boolean {
  return status === "pending" || status === "accepted";
}
