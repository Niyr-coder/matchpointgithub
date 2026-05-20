// Catálogo de TEMAS de personalización de perfil.
//
// ── Modelo (rediseño §29.20) ────────────────────────────────────────────────
// El jugador elige UN tema curado; no mezcla accent/card/banner por separado
// (los combos libres salían feos). `PROFILE_THEMES` es la ÚNICA fuente de
// verdad: cada tema define INLINE sus propios valores (accent hex, banner CSS,
// card CSS) de forma cohesiva. No referencia catálogos externos.
//
// Persistencia: el tema escribe su `key` en las 3 columnas de profiles
// (accent_color / card_style / banner_preset) — una por faceta. Así el render
// (perfil, ranking, roster, amigos) sigue resolviendo vía findAccent/
// findBanner/findCardStyle SIN cambios: esos resolvers + las Sets de validación
// se DERIVAN de PROFILE_THEMES (ver más abajo). No cambia el schema.
//
// Ownership por `bundleKey`:
//   'free'     → siempre disponible (tema Clásico / default).
//   'mp_plus'  → desbloqueado mientras user.plan_tier='premium'.
//   'pack_*'   → requiere fila en profile_cosmetic_grants.
//
// Para agregar un tema: agrega una entry a PROFILE_THEMES con sus valores
// inline. Los catálogos derivados y las Sets se recalculan solos. Si el tema es
// de un pack, su `bundleKey` debe matchear un bundle de FALLBACK_BUNDLES
// (bundles.ts) para heredar el bodyPattern del banner.

export type Tier =
  | "mp_plus"
  | "pack_neon"
  | "pack_gold"
  | "pack_carbon"
  | "pack_sakura"
  | "pack_brasa"
  | "pack_vineta"
  | "pack_vapor";

// CSS del card-style de un tema (wrapper de stat cards, friend cards, listings).
export type ThemeCardCss = {
  background: string;
  border?: string;
  boxShadow?: string;
  backdropFilter?: string;
  color?: string;
};

// Un tema autocontenido. `null` en una faceta = usar el default del sistema
// (accent → var(--primary); banner → sin banner; card → card neutra del DS).
export type ProfileTheme = {
  key: string;
  label: string;
  bundleKey: string; // 'free' | 'mp_plus' | 'pack_*'
  accentHex: string | null;
  bannerCss: string | null;
  cardCss: ThemeCardCss | null;
};

// ── Catálogo curado (9 temas) ───────────────────────────────────────────────
// 1 free + 4 mp_plus + 4 packs (uno por bundle pago, sin huérfanos).
// Combos armados con armonía de color: el accent vive dentro de la paleta del
// banner, y la card es neutra (mp_plus) o con identidad del pack.
export const PROFILE_THEMES: ProfileTheme[] = [
  {
    key: "default",
    label: "Clásico",
    bundleKey: "free",
    accentHex: null,
    bannerCss: null,
    cardCss: null,
  },

  // ── MatchPoint+ — card tintada con el accent, intensidad por rareza.
  //    Raro (esmeralda/oceano/pizarra): glass con tinte claro del accent + borde
  //    del accent. Épico (crepusculo/coral/medianoche): tinte más saturado +
  //    sombra de color. Ver THEME_RARITY + la escalera rareza→intensidad.
  {
    key: "esmeralda",
    label: "Esmeralda",
    bundleKey: "mp_plus",
    accentHex: "#10b981",
    bannerCss: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)",
    cardCss: {
      background: "rgba(236,253,245,0.78)",
      border: "1px solid rgba(16,185,129,0.4)",
      backdropFilter: "blur(10px)",
      boxShadow: "0 4px 18px rgba(16,185,129,0.12)",
    },
  },
  {
    key: "oceano",
    label: "Océano",
    bundleKey: "mp_plus",
    accentHex: "#0ea5e9",
    bannerCss: "linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 50%, #67e8f9 100%)",
    cardCss: {
      background: "rgba(240,249,255,0.78)",
      border: "1px solid rgba(14,165,233,0.4)",
      backdropFilter: "blur(10px)",
      boxShadow: "0 4px 18px rgba(14,165,233,0.12)",
    },
  },
  {
    key: "crepusculo",
    label: "Crepúsculo",
    bundleKey: "mp_plus",
    accentHex: "#7c3aed",
    bannerCss: "linear-gradient(135deg, #312e81 0%, #6366f1 50%, #a78bfa 100%)",
    cardCss: {
      background: "rgba(245,243,255,0.82)",
      border: "1px solid rgba(124,58,237,0.45)",
      backdropFilter: "blur(12px)",
      boxShadow: "0 6px 24px rgba(124,58,237,0.2)",
    },
  },
  {
    key: "pizarra",
    label: "Pizarra",
    bundleKey: "mp_plus",
    accentHex: "#64748b",
    bannerCss: "linear-gradient(135deg, #1e293b 0%, #475569 50%, #94a3b8 100%)",
    cardCss: {
      background: "rgba(248,250,252,0.85)",
      border: "1px solid rgba(100,116,139,0.4)",
      boxShadow: "0 4px 16px rgba(71,85,105,0.12)",
    },
  },

  // ── Packs (4) — card con identidad del pack; banner hereda su bodyPattern.
  {
    key: "neon",
    label: "Neón",
    bundleKey: "pack_neon",
    // Cyberpunk violeta/cyan — alineado a la identidad del pack (su bodyPattern
    // es grid violeta+cyan y el accent del bundle es violeta). El verde anterior
    // no cuadraba con su propio pack ni con el banner.
    accentHex: "#a855f7",
    bannerCss: "linear-gradient(135deg, #0c0a09 0%, #6d28d9 45%, #22d3ee 100%)",
    cardCss: {
      background: "linear-gradient(135deg, #1e1b4b, #0c0a1f)",
      border: "1px solid #a855f7",
      boxShadow: "0 0 24px rgba(168,85,247,0.4)",
      color: "#ede9fe",
    },
  },
  {
    key: "oro",
    label: "Oro",
    bundleKey: "pack_gold",
    // Ámbar oscuro (no #fbbf24) para que el número de la stat card tenga
    // contraste legible sobre la card glass dorada (fondo crema).
    accentHex: "#d97706",
    bannerCss: "radial-gradient(circle at 50% 50%, #fbbf24, #b45309 50%, #1c1917 100%)",
    // Card glass dorada (reemplaza la holográfica pink/cyan que chocaba con el oro).
    cardCss: {
      background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
      border: "1px solid #fbbf24",
      boxShadow: "0 8px 24px rgba(251,191,36,0.22)",
      color: "#78350f",
    },
  },
  {
    key: "carbon",
    label: "Carbón",
    bundleKey: "pack_carbon",
    accentHex: "#a1a1aa",
    bannerCss: "linear-gradient(180deg, #000000 0%, #1f1f23 60%, #3f3f46 100%)",
    cardCss: {
      background: "linear-gradient(135deg, #18181b, #27272a)",
      border: "1px solid #3f3f46",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      color: "#fafafa",
    },
  },
  {
    key: "sakura",
    label: "Sakura",
    bundleKey: "pack_sakura",
    accentHex: "#fb7185",
    bannerCss: "linear-gradient(135deg, #831843 0%, #ec4899 50%, #fbcfe8 100%)",
    cardCss: {
      background: "linear-gradient(135deg, rgba(251,207,232,0.6), rgba(244,114,182,0.4))",
      border: "1px solid rgba(255,255,255,0.5)",
      backdropFilter: "blur(12px)",
      boxShadow: "0 8px 24px rgba(236,72,153,0.18)",
      color: "#831843",
    },
  },

  // ── MatchPoint+ extra (2) — épico: tinte saturado + sombra de color.
  {
    key: "coral",
    label: "Coral",
    bundleKey: "mp_plus",
    accentHex: "#f43f5e",
    bannerCss: "linear-gradient(135deg, #9f1239 0%, #fb7185 50%, #fed7aa 100%)",
    cardCss: {
      background: "rgba(255,241,242,0.82)",
      border: "1px solid rgba(244,63,94,0.45)",
      backdropFilter: "blur(12px)",
      boxShadow: "0 6px 24px rgba(244,63,94,0.18)",
    },
  },
  {
    key: "medianoche",
    label: "Medianoche",
    bundleKey: "mp_plus",
    accentHex: "#818cf8",
    bannerCss: "linear-gradient(135deg, #020617 0%, #1e293b 55%, #334155 100%)",
    cardCss: {
      background: "rgba(238,242,255,0.82)",
      border: "1px solid rgba(129,140,248,0.5)",
      backdropFilter: "blur(12px)",
      boxShadow: "0 6px 24px rgba(79,70,229,0.18)",
    },
  },

  // ── Packs temáticos inspirados (3) — nombre/arte propios, sin IP literal.
  {
    // Shōnen / "demon slayer" vibe: rojos sobre negro, brasas.
    key: "brasa",
    label: "Brasa",
    bundleKey: "pack_brasa",
    accentHex: "#ef4444",
    bannerCss: "linear-gradient(135deg, #0a0a0a 0%, #7f1d1d 55%, #f97316 100%)",
    cardCss: {
      background: "linear-gradient(135deg, #1c0a0a, #0a0a0a)",
      border: "1px solid #ef4444",
      boxShadow: "0 0 24px rgba(239,68,68,0.3)",
      color: "#fee2e2",
    },
  },
  {
    // Comic / pop-art: halftone + outline grueso, primarios.
    key: "vineta",
    label: "Viñeta",
    bundleKey: "pack_vineta",
    accentHex: "#2563eb",
    bannerCss: "linear-gradient(135deg, #fde047 0%, #f97316 45%, #dc2626 100%)",
    cardCss: {
      background: "#ffffff",
      border: "2.5px solid #0a0a0a",
      boxShadow: "4px 4px 0 #0a0a0a",
      color: "#0a0a0a",
    },
  },
  {
    // Synthwave / vaporwave: pink/cyan/violeta, grid retro.
    key: "vapor",
    label: "Vapor",
    bundleKey: "pack_vapor",
    accentHex: "#22d3ee",
    bannerCss: "linear-gradient(135deg, #2e1065 0%, #db2777 55%, #22d3ee 100%)",
    cardCss: {
      background: "linear-gradient(135deg, #1e1b4b, #3b0764)",
      border: "1px solid #f0abfc",
      boxShadow: "0 0 24px rgba(217,70,239,0.3)",
      color: "#f5d0fe",
    },
  },
];

export const THEME_KEYS = new Set(PROFILE_THEMES.map((t) => t.key));

export function findTheme(key: string | null | undefined): ProfileTheme | null {
  if (!key) return null;
  return PROFILE_THEMES.find((t) => t.key === key) ?? null;
}

// ── Rareza ─────────────────────────────────────────────────────────────────
// Etiqueta visual de coleccionable (estilo juego). Es solo metadata para el
// badge en el picker — no afecta ownership ni gating (eso lo decide bundleKey).
// Vive en un mapa aparte para no tocar las 14 entries del catálogo.
export type Rarity =
  | "comun"
  | "raro"
  | "epico"
  | "mitico"
  | "legendario"
  | "especial"
  | "unico";

export const RARITY_META: Record<Rarity, { label: string; color: string }> = {
  comun: { label: "Común", color: "#9ca3af" },
  raro: { label: "Raro", color: "#3b82f6" },
  epico: { label: "Épico", color: "#a855f7" },
  mitico: { label: "Mítico", color: "#ec4899" },
  legendario: { label: "Legendario", color: "#f59e0b" },
  especial: { label: "Especial", color: "#14b8a6" },
  unico: { label: "Único", color: "#ef4444" },
};

// Escalera rareza → intensidad del card-style (regla de autoría de temas):
//   comun      → card default (sin tratamiento)
//   raro       → glass con tinte claro del accent + borde del accent
//   epico      → tinte más saturado + sombra de color suave
//   mitico     → card oscura/saturada + borde de color
//   legendario → card rica + glow de color
//   especial   → gradiente oscuro + glow
//   unico      → máximo (outline grueso / gradiente fuerte)
// Mantener la card de cada tema acorde a su rareza para una progresión coherente.
const THEME_RARITY: Record<string, Rarity> = {
  default: "comun",
  // MP+ incluidos
  esmeralda: "raro",
  oceano: "raro",
  pizarra: "raro",
  crepusculo: "epico",
  coral: "epico",
  medianoche: "epico",
  // Packs
  neon: "mitico",
  vapor: "mitico",
  oro: "legendario",
  sakura: "legendario",
  brasa: "especial",
  carbon: "especial",
  vineta: "unico",
};

export function rarityOf(themeKey: string): Rarity {
  return THEME_RARITY[themeKey] ?? "comun";
}

// Dado el estado persistido (accent/card/banner = key del tema en cada faceta),
// devuelve el tema que matchea, o null si es un combo legacy no-temático.
export function themeFromState(
  accent: string | null,
  card: string | null,
  banner: string | null,
): ProfileTheme | null {
  return (
    PROFILE_THEMES.find((t) => {
      const a = t.accentHex == null ? null : t.key;
      const c = t.cardCss == null ? null : t.key;
      const b = t.bannerCss == null ? null : t.key;
      return a === accent && c === card && b === banner;
    }) ?? null
  );
}

// Las 3 columnas que el tema escribe en profiles (una key por faceta presente).
export function themeColumns(t: ProfileTheme): {
  accent_color: string | null;
  card_style: string | null;
  banner_preset: string | null;
} {
  return {
    accent_color: t.accentHex == null ? null : t.key,
    card_style: t.cardCss == null ? null : t.key,
    banner_preset: t.bannerCss == null ? null : t.key,
  };
}

// ── Catálogos derivados (compat de render + validación) ──────────────────────
// El render (ProfileScreen/AmigosScreen/TeamScreen/api·me) y el path legacy de
// mezcla libre (setProfileCustomization, admin) resuelven keys vía estos
// resolvers. Se derivan de PROFILE_THEMES para que agregar/editar un tema sea
// un solo punto de cambio. La key de cada entry es la key del tema.
export type AccentColor = { key: string; label: string; hex: string; bundleKey: string };
export type BannerPreset = { key: string; label: string; background: string; bundleKey: string };
export type CardStyle = { key: string; label: string; css: ThemeCardCss; bundleKey: string };

export const ACCENT_COLORS: AccentColor[] = PROFILE_THEMES.filter(
  (t) => t.accentHex != null,
).map((t) => ({ key: t.key, label: t.label, hex: t.accentHex as string, bundleKey: t.bundleKey }));

export const BANNER_PRESETS: BannerPreset[] = PROFILE_THEMES.filter(
  (t) => t.bannerCss != null,
).map((t) => ({ key: t.key, label: t.label, background: t.bannerCss as string, bundleKey: t.bundleKey }));

export const CARD_STYLES: CardStyle[] = PROFILE_THEMES.filter(
  (t) => t.cardCss != null,
).map((t) => ({ key: t.key, label: t.label, css: t.cardCss as ThemeCardCss, bundleKey: t.bundleKey }));

export const ACCENT_KEYS = new Set(ACCENT_COLORS.map((a) => a.key));
export const BANNER_KEYS = new Set(BANNER_PRESETS.map((b) => b.key));
export const CARD_STYLE_KEYS = new Set(CARD_STYLES.map((c) => c.key));

export function findAccent(key: string | null | undefined): AccentColor | null {
  if (!key) return null;
  return ACCENT_COLORS.find((a) => a.key === key) ?? null;
}

export function findBanner(key: string | null | undefined): BannerPreset | null {
  if (!key) return null;
  return BANNER_PRESETS.find((b) => b.key === key) ?? null;
}

export function findCardStyle(key: string | null | undefined): CardStyle | null {
  if (!key) return null;
  return CARD_STYLES.find((c) => c.key === key) ?? null;
}

// ── Contraste ────────────────────────────────────────────────────────────
// Dado un color de fondo hex (#rgb o #rrggbb), devuelve el color de texto
// legible encima (negro o blanco) según luminancia relativa (WCAG). Lo usan
// los CTAs teñidos con el accent del tema (botón Agregar amigo, Retar a match)
// para garantizar legibilidad con cualquier accent presente o futuro.
export function readableTextOn(hex: string | null | undefined): string {
  if (!hex) return "#fff";
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Umbral perceptual WCAG (~0.179 = donde el contraste de negro y blanco
  // empata). Por encima → texto negro; debajo → blanco. Maximiza legibilidad
  // incluso en accents medios/grises (ej. Carbón #a1a1aa → texto negro).
  return luminance > 0.179 ? "#0a0a0a" : "#fff";
}
