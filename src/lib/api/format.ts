// Formatters reusable across screens. Display strings stay in Spanish.

const EC_TZ = "America/Guayaquil";

const EC_WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
const EC_MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

type EcDateParts = { y: number; m: number; d: number; h: number; min: number };

/** Partes de calendario en Ecuador — idénticas en Node y navegador (evita hydration mismatch). */
export function ecDateParts(iso: string, at: Date = new Date(iso)): EcDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: num("year"), m: num("month"), d: num("day"), h: num("hour"), min: num("minute") };
}

function sameEcDay(a: EcDateParts, b: EcDateParts): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

function gregorianWeekday(y: number, m: number, d: number): number {
  let y2 = y;
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (m < 3) y2 -= 1;
  return (y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) + t[m - 1] + d) % 7;
}

/** Hora 12h en español ecuatoriano, sin depender del ICU del runtime. */
export function fmtTimeEc(iso: string): string {
  const { h, min } = ecDateParts(iso);
  const pm = h >= 12;
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${pm ? "p. m." : "a. m."}`;
}

/** Fecha corta: Hoy / Mañana / «sáb, 10 oct». */
export function fmtShortDateEc(iso: string, now = new Date()): string {
  const p = ecDateParts(iso);
  const today = ecDateParts(now.toISOString(), now);
  if (sameEcDay(p, today)) return "Hoy";
  const tomorrowAt = new Date(now.getTime() + 86_400_000);
  const tomorrow = ecDateParts(tomorrowAt.toISOString(), tomorrowAt);
  if (sameEcDay(p, tomorrow)) return "Mañana";
  const wd = gregorianWeekday(p.y, p.m, p.d);
  const dd = String(p.d).padStart(2, "0");
  return `${EC_WEEKDAYS_SHORT[wd]}, ${dd} ${EC_MONTHS_SHORT[p.m - 1]}`;
}

const EC_MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** Fecha + hora corta estable SSR/cliente. Ej: «19 jun, 03:37 a. m.» */
export function fmtDateTimeEc(iso: string): string {
  const p = ecDateParts(iso);
  return `${p.d} ${EC_MONTHS_SHORT[p.m - 1]}, ${fmtTimeEc(iso)}`;
}

/** Fecha larga estable SSR/cliente. Ej: «19 de junio de 2026» */
export function fmtLongDateEc(iso: string): string {
  const p = ecDateParts(iso);
  return `${p.d} de ${EC_MONTHS_LONG[p.m - 1]} de ${p.y}`;
}

export function fmtPrice(cents: number, currency = "USD"): string {
  const value = cents / 100;
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", { day: "2-digit", month: "short" });
}

export function fmtRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = t - now;
  const diffMin = Math.round(diffMs / 60000);
  const fmt = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (Math.abs(diffMin) < 60) return fmt.format(diffMin, "minute");
  if (Math.abs(diffMin) < 60 * 24) return fmt.format(Math.round(diffMin / 60), "hour");
  return fmt.format(Math.round(diffMin / 60 / 24), "day");
}
