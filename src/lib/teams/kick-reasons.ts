// Motivos predefinidos para expulsar a un miembro del team. Compartido entre
// el server (validación + label de la notif) y el cliente (selector en el menú).
// Si agregas/cambias un motivo, queda reflejado en ambos lados automáticamente.

export const TEAM_KICK_REASONS = [
  { key: "inactivity", label: "Inactividad" },
  { key: "conduct", label: "Conducta inapropiada" },
  { key: "level", label: "No encaja con el nivel del equipo" },
  { key: "space", label: "Necesitamos liberar el cupo" },
  { key: "other", label: "Otro motivo" },
] as const;

export type KickReasonKey = (typeof TEAM_KICK_REASONS)[number]["key"];

export const KICK_REASON_KEYS = TEAM_KICK_REASONS.map((r) => r.key) as [KickReasonKey, ...KickReasonKey[]];

export function kickReasonLabel(key: string): string {
  return TEAM_KICK_REASONS.find((r) => r.key === key)?.label ?? "Sin especificar";
}
