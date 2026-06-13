export type NameplateTone = "emerald" | "forest" | "gold" | "violet" | "slate" | "charcoal";

export type NameplateKey =
  | "classic_matchpoint"
  | "competitor"
  | "founder"
  | "social"
  | "club_pro"
  | "support";

export type NameplateMarkChar = "." | "●" | "✦" | "/" | "+";

export type NameplateDefinition = {
  key: NameplateKey;
  mark: NameplateMarkChar;
  tone: NameplateTone;
  color: string;
  /** Nombre interno para el selector; no se muestra junto al nombre del jugador. */
  label: string;
  description: string;
  rules: string[];
};

export const DEFAULT_NAMEPLATE_KEY: NameplateKey = "classic_matchpoint";

export const NAMEPLATES: NameplateDefinition[] = [
  {
    key: "classic_matchpoint",
    mark: ".",
    tone: "emerald",
    color: "#10b981",
    label: "Clásico MATCHPOINT",
    description: "Remate verde por defecto para perfiles de jugador.",
    rules: ["Asignado por defecto.", "Solo el símbolo junto al nombre, sin pill ni texto extra."],
  },
  {
    key: "competitor",
    mark: "●",
    tone: "forest",
    color: "#064e3b",
    label: "Competidor",
    description: "Remate deportivo y sobrio para perfiles competitivos.",
    rules: ["Solo usa el símbolo junto al nombre.", "Sin texto libre ni sufijos personalizados."],
  },
  {
    key: "founder",
    mark: "✦",
    tone: "gold",
    color: "#ca8a04",
    label: "Fundador",
    description: "Marca dorada reservada para cuentas fundadoras.",
    rules: ["Reservado.", "No se muestra como badge o pill."],
  },
  {
    key: "social",
    mark: "+",
    tone: "violet",
    color: "#7c3aed",
    label: "Social",
    description: "Remate de comunidad para perfiles sociales.",
    rules: ["Representa actividad social.", "Se renderiza solo como símbolo."],
  },
  {
    key: "club_pro",
    mark: "/",
    tone: "slate",
    color: "#475569",
    label: "Club Pro",
    description: "Marca sobria para perfiles vinculados a clubes.",
    rules: ["Uso controlado por producto.", "Sin etiqueta debajo del nombre."],
  },
  {
    key: "support",
    mark: "●",
    tone: "charcoal",
    color: "#111827",
    label: "Soporte",
    description: "Marca reservada para cuentas operativas de MATCHPOINT.",
    rules: ["Reservado para operación.", "No reemplaza flujos de verificación."],
  },
];

export const NAMEPLATE_BY_KEY = Object.fromEntries(
  NAMEPLATES.map((nameplate) => [nameplate.key, nameplate]),
) as Record<NameplateKey, NameplateDefinition>;

export function getNameplate(key: NameplateKey | null | undefined): NameplateDefinition {
  return NAMEPLATE_BY_KEY[key ?? DEFAULT_NAMEPLATE_KEY] ?? NAMEPLATE_BY_KEY[DEFAULT_NAMEPLATE_KEY];
}

export function resolveNameplateKey(
  isOfficial: boolean | undefined,
  nameplateKey: NameplateKey | null | undefined,
): NameplateKey | null {
  if (isOfficial) return "support";
  return nameplateKey ?? null;
}
