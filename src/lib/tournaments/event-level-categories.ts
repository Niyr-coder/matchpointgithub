/** Niveles MPR para categorías rápidas en crear evento / torneo club. */
export const EVENT_LEVEL_OPTIONS = [
  { label: "2.5", min: 2.5 },
  { label: "3.0", min: 3.0 },
  { label: "3.5", min: 3.5 },
  { label: "4.0", min: 4.0 },
  { label: "4.5", min: 4.5 },
  { label: "5.0+", min: 5.0 },
] as const;

export const MPR_SLIDER_MIN = 2.0;
export const MPR_SLIDER_MAX = 8.0;
/** Mismo step que `MprRangeSlider` (partner / gestión torneo). */
export const MPR_SLIDER_STEP = 0.25;

export type EventLevelLabel = (typeof EVENT_LEVEL_OPTIONS)[number]["label"];

export type TournamentCategoryGender = "open" | "m" | "f" | "mixed";

export type TournamentCategoryModality = "singles" | "doubles" | "mixed_doubles";

export const CATEGORY_MODALITY_OPTIONS: {
  value: TournamentCategoryModality;
  label: string;
}[] = [
  { value: "singles", label: "Singles" },
  { value: "doubles", label: "Pareja" },
  { value: "mixed_doubles", label: "Mixto" },
];

/** Borrador de categoría en el wizard Crear evento (torneo/liga). */
export type TournamentCategoryDraft = {
  name: string;
  /** Atajo visual; null si el rango se ajustó manualmente. */
  levelLabel: EventLevelLabel | null;
  mprMin: number;
  /** null = sin tope superior (ej. 5.0+) */
  mprMax: number | null;
  noLevel: boolean;
  maxTeams: string;
  gender: TournamentCategoryGender;
  modality: TournamentCategoryModality;
};

const OPEN_CATEGORY_NAME = "Open Mixto";

export function emptyTournamentCategory(): TournamentCategoryDraft {
  return {
    name: defaultCategoryName(3.0, 4.0, false),
    levelLabel: "3.0",
    mprMin: 3.0,
    mprMax: 4.0,
    noLevel: false,
    maxTeams: "8",
    gender: "open",
    modality: "doubles",
  };
}

export function clampMpr(value: number): number {
  const snapped = Math.round(value / MPR_SLIDER_STEP) * MPR_SLIDER_STEP;
  return Math.min(
    MPR_SLIDER_MAX,
    Math.max(MPR_SLIDER_MIN, Math.round(snapped * 100) / 100),
  );
}

/** Rango sugerido al tocar un atajo de nivel. */
export function mprPresetRange(label: EventLevelLabel): { mprMin: number; mprMax: number | null } {
  const level = eventLevelOption(label);
  if (!level) return { mprMin: 3.0, mprMax: 4.0 };
  if (label.endsWith("+")) return { mprMin: level.min, mprMax: null };
  return { mprMin: level.min, mprMax: clampMpr(level.min + 1.0) };
}

/** Normaliza borradores viejos (solo levelLabel) al abrir el wizard. */
export function normalizeTournamentCategoryDraft(
  cat: TournamentCategoryDraft,
): TournamentCategoryDraft {
  if (cat.noLevel) return cat;
  if (typeof cat.mprMin === "number") {
    return {
      ...cat,
      mprMin: clampMpr(cat.mprMin),
      mprMax: cat.mprMax == null ? null : clampMpr(cat.mprMax),
    };
  }
  const legacy = mprRangeFromLevelLabel(cat.levelLabel, false);
  return {
    ...cat,
    mprMin: legacy.mprMin ?? 3.0,
    mprMax: legacy.mprMax,
  };
}

export function eventLevelOption(label: string) {
  return EVENT_LEVEL_OPTIONS.find((l) => l.label === label);
}

function defaultCategoryName(
  mprMin: number,
  mprMax: number | null,
  noLevel: boolean,
): string {
  if (noLevel) return OPEN_CATEGORY_NAME;
  if (mprMax == null) return `Categoría ${mprMin.toFixed(1)}+`;
  if (Math.abs(mprMax - mprMin) < 0.05) return `Categoría ${mprMin.toFixed(1)}`;
  return `Categoría ${mprMin.toFixed(1)}–${mprMax.toFixed(1)}`;
}

/** Nombre sugerido desde el nivel; solo pisa el input si aún va sincronizado. */
function isSyncedCategoryName(name: string): boolean {
  const t = name.trim();
  if (!t) return true;
  if (t === OPEN_CATEGORY_NAME) return true;
  return /^Categoría\s+\d(?:\.\d)?(?:\+|–\d(?:\.\d)?)?$/i.test(t);
}

export function patchTournamentCategoryDraft(
  cat: TournamentCategoryDraft,
  patch: Partial<TournamentCategoryDraft>,
): TournamentCategoryDraft {
  const next = { ...cat, ...patch };
  if (
    ("levelLabel" in patch ||
      "noLevel" in patch ||
      "mprMin" in patch ||
      "mprMax" in patch) &&
    isSyncedCategoryName(cat.name)
  ) {
    next.name = defaultCategoryName(next.mprMin, next.mprMax, next.noLevel);
  }
  if (!next.noLevel && next.mprMax != null && next.mprMin > next.mprMax) {
    next.mprMax = next.mprMin;
  }
  return next;
}

export function categoryDraftMprRange(cat: TournamentCategoryDraft): {
  mprMin: number | null;
  mprMax: number | null;
} {
  if (cat.noLevel) return { mprMin: null, mprMax: null };
  if (typeof cat.mprMin === "number") {
    return { mprMin: cat.mprMin, mprMax: cat.mprMax ?? null };
  }
  return mprRangeFromLevelLabel(cat.levelLabel, false);
}

export function mprRangeFromLevelLabel(levelLabel: EventLevelLabel | null, noLevel: boolean) {
  if (noLevel || !levelLabel) {
    return { mprMin: null as number | null, mprMax: null as number | null };
  }
  const level = eventLevelOption(levelLabel);
  if (!level) {
    return { mprMin: null, mprMax: null };
  }
  const openTop = levelLabel.endsWith("+");
  return {
    mprMin: level.min,
    mprMax: openTop ? null : Math.min(8, level.min + 0.49),
  };
}

export function categoryDraftCupoLabel(modality: TournamentCategoryModality): string {
  return modality === "singles" ? "Cupo (jugadores)" : "Cupo (parejas)";
}

export function categoryDraftCupoUnit(modality: TournamentCategoryModality): string {
  return modality === "singles" ? "jugadores" : "parejas";
}

export function categoryDraftSummary(cat: TournamentCategoryDraft): string {
  const parts: string[] = [];
  const modLabel = CATEGORY_MODALITY_OPTIONS.find((m) => m.value === cat.modality)?.label;
  if (modLabel) parts.push(modLabel);
  const { mprMin, mprMax } = categoryDraftMprRange(cat);
  parts.push(formatMprRange(mprMin, mprMax));
  if (cat.gender !== "open") {
    const g =
      cat.gender === "m"
        ? "Masculino"
        : cat.gender === "f"
          ? "Femenino"
          : "Mixto";
    parts.push(g);
  }
  const teams = parseInt(cat.maxTeams, 10);
  if (Number.isFinite(teams) && teams > 0) {
    parts.push(`${teams} ${categoryDraftCupoUnit(cat.modality)}`);
  }
  return parts.join(" · ");
}

/** Convierte borradores del wizard en payload de creación de torneo. */
export function categoryDraftsToCreatePayload(categories: TournamentCategoryDraft[]) {
  return categories
    .filter((c) => c.name.trim())
    .map((c) => {
      const { mprMin, mprMax } = categoryDraftMprRange(c);
      const maxTeams = parseInt(c.maxTeams, 10);
      return {
        name: c.name.trim(),
        gender: c.gender,
        modality: c.modality,
        mprMin,
        mprMax,
        maxTeams: Number.isFinite(maxTeams) && maxTeams > 0 ? maxTeams : null,
      };
    });
}

export function totalCategoryTeams(categories: TournamentCategoryDraft[]): number {
  return categories.reduce((sum, c) => {
    const n = parseInt(c.maxTeams, 10);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/** Valida categorías del wizard torneo/liga. Devuelve mensaje de error o null. */
export function validateTournamentCategoryDrafts(categories: TournamentCategoryDraft[]): string | null {
  const named = categories.filter((c) => c.name.trim());
  if (named.length === 0) return "Agrega al menos una categoría con nombre y cupos.";
  for (const c of named) {
    if (!c.noLevel) {
      const { mprMin, mprMax } = categoryDraftMprRange(c);
      if (mprMin != null && mprMax != null && mprMin > mprMax) {
        return `En "${c.name.trim()}" el MPR mínimo no puede ser mayor que el máximo.`;
      }
    }
    const teams = parseInt(c.maxTeams, 10);
    if (!Number.isFinite(teams) || teams < 1) {
      const unit = categoryDraftCupoUnit(c.modality);
      return `En "${c.name.trim()}" indica al menos 1 ${unit === "jugadores" ? "jugador" : "pareja"} de cupo.`;
    }
  }
  return null;
}

/** Convierte chips seleccionados en categorías de torneo con rango MPR. */
export function buildTournamentCategoriesFromLevels(
  selectedLabels: string[],
  maxTeamsPerCategory?: number | null,
) {
  const sorted = EVENT_LEVEL_OPTIONS.filter((l) => selectedLabels.includes(l.label));
  return sorted.map((level) => {
    const openTop = level.label.endsWith("+");
    return {
      name: `Categoría ${level.label}`,
      gender: "open" as const,
      mprMin: level.min,
      mprMax: openTop ? null : Math.min(8, level.min + 0.49),
      maxTeams: maxTeamsPerCategory ?? null,
    };
  });
}

export function formatMprRange(mprMin: number | null, mprMax: number | null): string {
  if (mprMin == null && mprMax == null) return "Open";
  if (mprMin != null && mprMax == null) return `${mprMin.toFixed(1)}+`;
  if (mprMin != null && mprMax != null) return `${mprMin.toFixed(1)}–${mprMax.toFixed(1)}`;
  return `Hasta ${mprMax!.toFixed(1)}`;
}

/** Mapeo del selector de formato del modal club → enum tournaments.format */
export function clubEventFormatToTournament(formatLabel: string): string {
  if (formatLabel.includes("Round-robin")) return "round_robin";
  if (formatLabel.includes("Grupos")) return "groups_to_knockout";
  return "single_elim";
}

export const GENDER_OPTIONS: { value: TournamentCategoryGender; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "m", label: "Masculino" },
  { value: "f", label: "Femenino" },
  { value: "mixed", label: "Mixto" },
];
