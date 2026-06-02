/** Presentación del hero de RetarModal (client + server). */

export const RETAR_AV_GRADIENTS = [
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
] as const;

const STARTING_RATING = 2500;

export type RetarHeroWho = {
  name: string;
  level: number;
  av: string;
  avBg: string;
};

export function retarGradientForUserId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return RETAR_AV_GRADIENTS[Math.abs(h) % RETAR_AV_GRADIENTS.length];
}

export function retarInitialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function retarLevelFromRating(elo: number | null | undefined): number {
  return Math.round(((elo ?? STARTING_RATING) / 1000) * 10) / 10;
}

export function retarHeroWhoFromUser(
  userId: string,
  displayName: string | null | undefined,
  username: string | null | undefined,
  rating?: number | null,
): RetarHeroWho {
  const name = displayName?.trim() || username?.trim() || "Jugador";
  return {
    name,
    level: retarLevelFromRating(rating),
    av: retarInitialsFromName(name),
    avBg: retarGradientForUserId(userId),
  };
}
