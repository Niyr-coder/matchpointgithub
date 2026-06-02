/** Texto relativo en español (tuteo neutro) para “Actualizado …”. */
export function formatAnalyticsUpdatedLabel(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  const mins = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  if (mins < 1) return "Actualizado ahora";
  if (mins === 1) return "Actualizado hace 1 min";
  if (mins < 60) return `Actualizado hace ${mins} min`;

  const hours = Math.floor(mins / 60);
  if (hours === 1) return "Actualizado hace 1 h";
  if (hours < 24) return `Actualizado hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Actualizado ayer";
  return `Actualizado hace ${days} días`;
}
