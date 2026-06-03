// Reglas clave predefinidas para quedadas (wizard de crear). El organizador
// solo marca las que aplican; se guardan como QuedadaRule en la BD.

export type PresetQuedadaRule = {
  id: string;
  text: string;
  warn: boolean;
};

export const PRESET_QUEDADA_RULES: PresetQuedadaRule[] = [
  {
    id: "checkin-30",
    text: "Acreditación al menos 30 minutos antes del primer partido.",
    warn: true,
  },
  {
    id: "payment-before",
    text: "La cuota debe estar pagada antes del día del evento (comprobante validado).",
    warn: true,
  },
  {
    id: "dress-code",
    text: "Vestimenta deportiva adecuada (no calzado de calle en cancha).",
    warn: false,
  },
  {
    id: "level-category",
    text: "Se respeta la categoría y nivel asignados al inscribirse.",
    warn: false,
  },
  {
    id: "wo-no-show",
    text: "Walk-over (WO) si no te presentas o llegas muy tarde sin avisar.",
    warn: true,
  },
  {
    id: "no-refund",
    text: "No hay reembolso por inasistencia o cancelación el mismo día.",
    warn: true,
  },
  {
    id: "fair-play",
    text: "Fair play: disputas las resuelve el organizador en cancha.",
    warn: false,
  },
  {
    id: "minors",
    text: "Menores de edad requieren autorización del responsable.",
    warn: false,
  },
];

const byId = new Map(PRESET_QUEDADA_RULES.map((r) => [r.id, r]));

export function presetIdsToRuleDrafts(ids: string[]): { text: string; warn: boolean }[] {
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is PresetQuedadaRule => !!r)
    .map((r) => ({ text: r.text, warn: r.warn }));
}

export function ruleDraftsToPresetIds(drafts: { text: string; warn: boolean }[]): string[] {
  const texts = new Set(drafts.map((d) => d.text.trim()));
  return PRESET_QUEDADA_RULES.filter((p) => texts.has(p.text)).map((p) => p.id);
}

const presetTextSet = new Set(PRESET_QUEDADA_RULES.map((p) => p.text));

export function splitRuleDrafts(drafts: { text: string; warn: boolean }[]): {
  presetIds: string[];
  customRules: { text: string; warn: boolean }[];
} {
  return {
    presetIds: ruleDraftsToPresetIds(drafts),
    customRules: drafts.filter((d) => d.text.trim() && !presetTextSet.has(d.text.trim())),
  };
}

export function mergeRuleDrafts(
  presetIds: string[],
  customRules: { text: string; warn: boolean }[],
): { text: string; warn: boolean }[] {
  return [...presetIdsToRuleDrafts(presetIds), ...customRules.filter((r) => r.text.trim())];
}
