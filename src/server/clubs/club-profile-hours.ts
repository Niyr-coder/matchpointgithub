/** Horario del club para StatTile del perfil — alineado al handoff club-web. */

export function compactHourRange(range: string | null): string | null {
  if (!range) return null;
  const m = range.match(/(\d{2}):(\d{2})\s*[—–-]\s*(\d{2}):(\d{2})/);
  if (!m) return range;
  return `${m[1]}–${m[3]}h`;
}

export function summarizeWeeklyOpenHours(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const slots = days.map((d) => {
    const day = (raw as Record<string, { open?: string; close?: string }>)[d];
    if (!day?.open || !day?.close) return null;
    return `${day.open} – ${day.close}`;
  });
  const unique = [...new Set(slots.filter(Boolean))];
  if (unique.length === 1) return `Lun–Dom · ${unique[0]}`;
  return null;
}
