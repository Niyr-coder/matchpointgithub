/** Utilidades para columnas `during` (tstzrange) en reservas y sesiones. */

function parseRangeStartLoose(during: string): Date | null {
  const m = during.match(/^[[(]"?([^",)]+)/);
  if (!m) return null;
  const d = new Date(m[1]);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseRangeEndLoose(during: string): Date | null {
  const m = during.match(/[, ]"?([^",)\]]+)[")\]]$/);
  if (!m) return null;
  const d = new Date(m[1]);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse `[lower,upper)` — misma regex que MisReservasScreenView. */
export function parseTstzRange(range: string): { start: Date | null; end: Date | null } {
  const raw = typeof range === "string" ? range : String(range ?? "");
  const m = raw.match(/^[[(]"?([^",)]+)"?,"?([^",)]+)"?[\])]$/);
  if (!m) {
    return { start: parseRangeStartLoose(raw), end: parseRangeEndLoose(raw) };
  }
  const start = new Date(m[1]);
  const end = new Date(m[2]);
  return {
    start: Number.isNaN(start.getTime()) ? null : start,
    end: Number.isNaN(end.getTime()) ? null : end,
  };
}

/** Próxima = no cancelada y el tramo no terminó (igual que tab Próximas en Mis reservas). */
export function isReservationUpcoming(
  during: string,
  status: string,
  nowMs: number = Date.now(),
): boolean {
  if (status === "cancelled") return false;
  const { end } = parseTstzRange(during);
  if (end && end.getTime() < nowMs) return false;
  return true;
}

export function parseRangeStart(during: string): Date | null {
  return parseTstzRange(during).start;
}

export function parseRangeEnd(during: string): Date | null {
  return parseTstzRange(during).end;
}

/** Ventana half-open para `.overlaps("during", …)` en PostgREST. */
export function overlapsRangeIso(start: Date, end: Date): string {
  return `[${start.toISOString()},${end.toISOString()})`;
}

export function fmtHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function durationLabelMinutes(start: Date, end: Date | null): string {
  if (!end) return "—";
  const min = Math.round((end.getTime() - start.getTime()) / 60000);
  return min > 0 ? `${min}m` : "—";
}

export function sportLabel(s: string): string {
  if (s === "padel") return "Pádel";
  if (s === "pickleball" || s === "pickle") return "Pickle";
  if (s === "tennis") return "Tenis";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
