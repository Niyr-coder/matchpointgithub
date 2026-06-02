// Bandas visuales de nivel MPR (escala display 1.0–7.0) para sliders y filtros de avisos.

export const SKILL_LEVEL_MIN = 1;
export const SKILL_LEVEL_MAX = 7;
export const SKILL_LEVEL_STEP = 0.1;
export const SKILL_LEVEL_SPAN = SKILL_LEVEL_MAX - SKILL_LEVEL_MIN;

/** Marcas en el eje (límites de banda + extremos). */
export const SKILL_LEVEL_TICKS = [1.0, 2.5, 3.5, 4.5, 5.5, 7.0] as const;

export type SkillLevelBand = {
  id: string;
  min: number;
  max: number;
  label: string;
  signal: string;
  tint: string;
  activeTint: string;
};

export const SKILL_LEVEL_BANDS: SkillLevelBand[] = [
  { id: "init", min: 1.0, max: 2.5, label: "Iniciación", signal: "INI", tint: "#f4f4f5", activeTint: "#e4e4e7" },
  { id: "rec", min: 2.5, max: 3.5, label: "Recreativo", signal: "REC", tint: "#ecfdf5", activeTint: "#d1fae5" },
  { id: "int", min: 3.5, max: 4.5, label: "Intermedio", signal: "INT", tint: "#d1fae5", activeTint: "#a7f3d0" },
  { id: "adv", min: 4.5, max: 5.5, label: "Avanzado", signal: "ADV", tint: "#a7f3d0", activeTint: "#6ee7b7" },
  { id: "comp", min: 5.5, max: 7.0, label: "Competitivo", signal: "PRO", tint: "#6ee7b7", activeTint: "#34d399" },
];

export const SKILL_LEVEL_PRESETS: { label: string; min: number; max: number }[] = [
  { label: "Principiante", min: 1.0, max: 2.5 },
  { label: "2.5–3.0", min: 2.5, max: 3.0 },
  { label: "3.0–3.5", min: 3.0, max: 3.5 },
  { label: "3.5–4.0", min: 3.5, max: 4.0 },
  { label: "4.0–4.5", min: 4.0, max: 4.5 },
  { label: "4.5+", min: 4.5, max: 7.0 },
];

export function normalizeSkillLevel(value: number): number {
  return Math.min(SKILL_LEVEL_MAX, Math.max(SKILL_LEVEL_MIN, Math.round(value * 10) / 10));
}

export function formatSkillLevel(value: number): string {
  return normalizeSkillLevel(value).toFixed(1);
}

export function skillLevelToPercent(value: number): number {
  return ((normalizeSkillLevel(value) - SKILL_LEVEL_MIN) / SKILL_LEVEL_SPAN) * 100;
}

export function bandsTouchingRange(min: number, max: number): SkillLevelBand[] {
  const lo = normalizeSkillLevel(min);
  const hi = normalizeSkillLevel(max);
  return SKILL_LEVEL_BANDS.filter((b) => b.max >= lo && b.min <= hi);
}

export function rangeBandSummary(min: number, max: number): string {
  const names = bandsTouchingRange(min, max).map((b) => b.label);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} → ${names[names.length - 1]}`;
}
