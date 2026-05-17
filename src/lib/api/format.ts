// Formatters reusable across screens. Display strings stay in Spanish.

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
