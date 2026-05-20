// Helpers de ownership para presets cosméticos.
//
// El gating real vive en DB (cosmetic_bundles + profile_cosmetic_grants); acá
// solo agrupamos las decisiones de "¿este preset está disponible para el
// user que mira el catálogo?" para la UI del picker y el server action de
// validación.
//
// Catálogo display de bundles está en DB (tabla cosmetic_bundles). Acá solo
// definimos un fallback estático con metadata UI (colores/glow del card en
// la sección "Bundles disponibles") por si en algún render no llegó la data
// del server. La fuente de verdad es siempre la tabla.

import type { Tier } from "./customization-presets";

export type BundleInfo = {
  key: Tier;
  label: string;
  description: string;
  priceCents: number;
  accent: string; // color hex para tinta el card del bundle en la UI
  // CSS background del overlay que se aplica al body del header del perfil
  // (debajo del banner) cuando el user tiene un BANNER de este bundle activo.
  // Cada bundle define su propio doodle/pattern temático — ej. neon pulse
  // glow, gold sparkles, carbon noise, sakura petals. null = sin pattern.
  bodyPattern: string | null;
};

// Sentinel: presets con bundleKey 'mp_plus' no son un bundle pago.
export const MP_PLUS_KEY = "mp_plus" as const;

// Fallback estático (DB se considera fuente de verdad — esto solo es para SSR
// inicial o casos donde la tabla esté vacía). Los bodyPatterns viven SOLO acá
// (no en DB) — son parte del visual identity del bundle, no editables.
export const FALLBACK_BUNDLES: BundleInfo[] = [
  {
    key: "pack_neon",
    label: "Pack Neon",
    description: "Tonos eléctricos con glow neón.",
    priceCents: 500,
    accent: "#a855f7",
    // Cyber grid + glow puntual neon-violeta y cyan.
    bodyPattern:
      "radial-gradient(circle at 12% 18%, rgba(168,85,247,0.18), transparent 28%), radial-gradient(circle at 88% 78%, rgba(34,211,238,0.16), transparent 30%), repeating-linear-gradient(135deg, transparent 0 24px, rgba(168,85,247,0.06) 24px 25px)",
  },
  {
    key: "pack_gold",
    label: "Pack Gold",
    description: "Para los campeones — accent dorado.",
    priceCents: 500,
    accent: "#fbbf24",
    // Sparkles dorados (SVG 4-point stars dispersos) + warm radial glow.
    // El SVG tile es 180px, scattered con rotaciones distintas. El glow
    // queda como base; los sparkles flotan encima.
    bodyPattern:
      "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cg fill='%23fbbf24' fill-opacity='0.55'%3E%3Cpath d='M30 25 L33 32 L40 35 L33 38 L30 45 L27 38 L20 35 L27 32 Z'/%3E%3Cpath d='M140 50 L142 55 L148 57 L142 59 L140 64 L138 59 L132 57 L138 55 Z' opacity='0.8'/%3E%3Cpath d='M90 110 L93 117 L100 120 L93 123 L90 130 L87 123 L80 120 L87 117 Z'/%3E%3Cpath d='M50 145 L52 150 L57 152 L52 154 L50 159 L48 154 L43 152 L48 150 Z' opacity='0.7'/%3E%3Cpath d='M155 140 L158 147 L165 150 L158 153 L155 160 L152 153 L145 150 L152 147 Z'/%3E%3C/g%3E%3C/svg%3E\"), radial-gradient(circle at 15% 25%, rgba(251,191,36,0.18), transparent 30%), radial-gradient(circle at 78% 70%, rgba(180,83,9,0.12), transparent 35%)",
  },
  {
    key: "pack_carbon",
    label: "Pack Carbon",
    description: "Minimalismo oscuro premium.",
    priceCents: 400,
    accent: "#18181b",
    // Carbon weave + soft graphite noise.
    bodyPattern:
      "repeating-linear-gradient(45deg, rgba(0,0,0,0.04) 0 2px, transparent 2px 4px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.04) 0 2px, transparent 2px 4px)",
  },
  {
    key: "pack_sakura",
    label: "Pack Sakura",
    description: "Tonos rosados y pastel mesh holográfico.",
    priceCents: 400,
    accent: "#ec4899",
    // Pétalos sakura (SVG elipses rotadas) dispersos sobre mesh rosado.
    // 6 pétalos en un tile de 200px con rotaciones y opacidades variadas
    // para que el patrón no se vea repetitivo a escala normal del header.
    bodyPattern:
      "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cg fill='%23ec4899' fill-opacity='0.32'%3E%3Cellipse cx='30' cy='40' rx='10' ry='5' transform='rotate(35 30 40)'/%3E%3Cellipse cx='150' cy='30' rx='9' ry='4.5' transform='rotate(-20 150 30)' opacity='0.85'/%3E%3Cellipse cx='110' cy='110' rx='8' ry='4' transform='rotate(60 110 110)'/%3E%3Cellipse cx='50' cy='150' rx='10' ry='5' transform='rotate(-45 50 150)' opacity='0.75'/%3E%3Cellipse cx='175' cy='160' rx='9' ry='4.5' transform='rotate(15 175 160)'/%3E%3Cellipse cx='90' cy='60' rx='7' ry='3.5' transform='rotate(110 90 60)' opacity='0.65'/%3E%3C/g%3E%3C/svg%3E\"), radial-gradient(circle at 20% 30%, rgba(236,72,153,0.16), transparent 25%), radial-gradient(circle at 80% 70%, rgba(217,70,239,0.14), transparent 28%)",
  },
  {
    key: "pack_brasa",
    label: "Pack Brasa",
    description: "Energía shōnen — rojos sobre negro con brasas ardientes.",
    priceCents: 500,
    accent: "#ef4444",
    // Brasas (SVG circles dispersos naranja/rojo) + glow cálido desde abajo.
    bodyPattern:
      "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cg fill='%23f97316'%3E%3Ccircle cx='30' cy='40' r='3' fill-opacity='0.55'/%3E%3Ccircle cx='120' cy='28' r='2' fill-opacity='0.4'/%3E%3Ccircle cx='80' cy='92' r='2.5' fill-opacity='0.5'/%3E%3Ccircle cx='52' cy='132' r='2' fill-opacity='0.38'/%3E%3Ccircle cx='140' cy='118' r='3' fill-opacity='0.5'/%3E%3Ccircle cx='100' cy='150' r='1.5' fill-opacity='0.3'/%3E%3Ccircle cx='18' cy='90' r='1.5' fill-opacity='0.32'/%3E%3C/g%3E%3C/svg%3E\"), radial-gradient(ellipse at 50% 110%, rgba(249,115,22,0.24), transparent 50%), radial-gradient(circle at 18% 22%, rgba(239,68,68,0.14), transparent 32%)",
  },
  {
    key: "pack_vineta",
    label: "Pack Viñeta",
    description: "Estilo cómic — halftone, primarios y outline grueso.",
    priceCents: 500,
    accent: "#2563eb",
    // Halftone clásico: grid regular de puntos negros (tile 18px). Sobre el
    // banner brillante, el blend multiply lo vuelve un patrón de cómic nítido.
    bodyPattern:
      "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Ccircle cx='9' cy='9' r='2.4' fill='%230a0a0a' fill-opacity='0.18'/%3E%3C/svg%3E\")",
  },
  {
    key: "pack_vapor",
    label: "Pack Vapor",
    description: "Synthwave — grid retro y neón pink/cyan.",
    priceCents: 500,
    accent: "#d946ef",
    // Grid retro (repeating-linear-gradient se auto-tilea) + glow desde abajo.
    bodyPattern:
      "repeating-linear-gradient(0deg, rgba(34,211,238,0.10) 0 1px, transparent 1px 26px), repeating-linear-gradient(90deg, rgba(236,72,153,0.10) 0 1px, transparent 1px 26px), radial-gradient(ellipse at 50% 120%, rgba(217,70,239,0.2), transparent 52%)",
  },
];

// Helper: ¿el bundle de este bannerKey define un body pattern?
// Lee del catalog del banner para encontrar su bundleKey, después busca el
// pattern en FALLBACK_BUNDLES.
export function bodyPatternForBundle(bundleKey: string | null | undefined): string | null {
  if (!bundleKey || bundleKey === MP_PLUS_KEY) return null;
  return FALLBACK_BUNDLES.find((b) => b.key === bundleKey)?.bodyPattern ?? null;
}

// ¿El user puede USAR un preset con este bundleKey?
//   'mp_plus'      → require MP+ activo
//   '<bundle_key>' → require grant en myGrants
export function canUsePreset(
  bundleKey: string,
  args: { isPremium: boolean; myGrants: Set<string> },
): boolean {
  if (bundleKey === MP_PLUS_KEY) return args.isPremium;
  return args.myGrants.has(bundleKey);
}

// Tipo de label para el badge del preset en el picker.
export type LockState =
  | { kind: "owned" }                          // tiene el grant o MP+ activo
  | { kind: "mp_plus" }                        // requiere MP+, no lo tiene
  | { kind: "bundle"; bundleKey: string };     // requiere bundle pago, no lo tiene

export function lockStateFor(
  bundleKey: string,
  args: { isPremium: boolean; myGrants: Set<string> },
): LockState {
  if (canUsePreset(bundleKey, args)) return { kind: "owned" };
  if (bundleKey === MP_PLUS_KEY) return { kind: "mp_plus" };
  return { kind: "bundle", bundleKey };
}

export function priceLabel(cents: number): string {
  if (cents === 0) return "Gratis";
  return `$${(cents / 100).toFixed(2)}`;
}
