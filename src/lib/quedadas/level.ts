// Nivel de categoría = "Suma" combinada de la pareja: 2.0–14.0, paso 0.5.
// Helpers compartidos entre el wizard de crear, el panel de gestión y la
// duplicación (parsea el level_label guardado de vuelta a un valor de slider).
export const SUMA_MIN = 2;
export const SUMA_MAX = 14;

export function sumaLabel(suma: number): string {
  return `Suma ${suma.toFixed(1)}`;
}

// Devuelve {suma, noLevel}. noLevel = sin número (ej. "Open Mixto" o null).
export function parseSuma(label: string | null | undefined): { suma: number; noLevel: boolean } {
  if (!label) return { suma: 6, noLevel: true };
  const m = /(\d+(?:\.\d+)?)/.exec(label);
  if (!m) return { suma: 6, noLevel: true };
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return { suma: 6, noLevel: true };
  return { suma: Math.min(SUMA_MAX, Math.max(SUMA_MIN, Math.round(n * 2) / 2)), noLevel: false };
}
