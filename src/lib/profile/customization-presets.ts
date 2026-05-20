// Catálogo de presets para customización de perfil (MP+ exclusivo o bundles
// pagos — ver §29.X de docs/architecture/20-database.md y §7.2 de
// docs/product/00-matchpoint-plus.md).
//
// Persistencia: profiles.{accent_color,banner_preset,card_style} guardan el
// `key` del preset (no el CSS completo) — así podemos cambiar el render sin
// migrar data, y validar input contra el catálogo en server action.
//
// Cada preset tiene un `bundleKey`:
//   'mp_plus'         → desbloqueado mientras user.plan_tier='premium'
//   '<bundle_key>'    → requiere fila en profile_cosmetic_grants
//
// Distribución target: ~60% mp_plus / 40% bundles pagos.

export type Tier = "mp_plus" | "pack_neon" | "pack_gold" | "pack_carbon" | "pack_sakura";

export type AccentColor = {
  key: string;
  label: string;
  hex: string;
  bundleKey: Tier;
};

export type BannerPreset = {
  key: string;
  label: string;
  background: string;
  bundleKey: Tier;
};

export type CardStyle = {
  key: string;
  label: string;
  css: {
    background: string;
    border?: string;
    boxShadow?: string;
    backdropFilter?: string;
    color?: string;
  };
  bundleKey: Tier;
};

// 24 accent colors. 14 mp_plus, 10 en bundles.
export const ACCENT_COLORS: AccentColor[] = [
  // MP+ tier (14)
  { key: "emerald",   label: "Esmeralda",   hex: "#10b981", bundleKey: "mp_plus" },
  { key: "green",     label: "Verde",       hex: "#22c55e", bundleKey: "mp_plus" },
  { key: "lime",      label: "Lima",        hex: "#84cc16", bundleKey: "mp_plus" },
  { key: "teal",      label: "Teal",        hex: "#14b8a6", bundleKey: "mp_plus" },
  { key: "cyan",      label: "Cian",        hex: "#06b6d4", bundleKey: "mp_plus" },
  { key: "sky",       label: "Cielo",       hex: "#0ea5e9", bundleKey: "mp_plus" },
  { key: "blue",      label: "Azul",        hex: "#3b82f6", bundleKey: "mp_plus" },
  { key: "indigo",    label: "Índigo",      hex: "#6366f1", bundleKey: "mp_plus" },
  { key: "violet",    label: "Violeta",     hex: "#7c3aed", bundleKey: "mp_plus" },
  { key: "purple",    label: "Púrpura",     hex: "#a855f7", bundleKey: "mp_plus" },
  { key: "rose",      label: "Rosa",        hex: "#e11d48", bundleKey: "mp_plus" },
  { key: "orange",    label: "Naranja",     hex: "#f97316", bundleKey: "mp_plus" },
  { key: "slate",     label: "Pizarra",     hex: "#64748b", bundleKey: "mp_plus" },
  { key: "stone",     label: "Piedra",      hex: "#78716c", bundleKey: "mp_plus" },
  // pack_neon (2)
  { key: "neon-mint", label: "Neon Mint",   hex: "#34d399", bundleKey: "pack_neon" },
  { key: "neon-pink", label: "Neon Pink",   hex: "#ec4899", bundleKey: "pack_neon" },
  // pack_gold (2)
  { key: "amber",     label: "Ámbar",       hex: "#fbbf24", bundleKey: "pack_gold" },
  { key: "yellow",    label: "Dorado",      hex: "#eab308", bundleKey: "pack_gold" },
  // pack_carbon (2)
  { key: "black",     label: "Onyx",        hex: "#0a0a0a", bundleKey: "pack_carbon" },
  { key: "zinc",      label: "Carbon",      hex: "#3f3f46", bundleKey: "pack_carbon" },
  // pack_sakura (4)
  { key: "pink",      label: "Magenta",     hex: "#d946ef", bundleKey: "pack_sakura" },
  { key: "fuchsia",   label: "Fucsia",      hex: "#c026d3", bundleKey: "pack_sakura" },
  { key: "blush",     label: "Blush",       hex: "#fb7185", bundleKey: "pack_sakura" },
  { key: "lavender",  label: "Lavanda",     hex: "#a78bfa", bundleKey: "pack_sakura" },
];

// 30 banner presets. 18 mp_plus, 12 en bundles.
export const BANNER_PRESETS: BannerPreset[] = [
  // MP+ tier (18)
  { key: "emerald-night", label: "Emerald Night",  background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)",                bundleKey: "mp_plus" },
  { key: "forest",        label: "Forest",         background: "linear-gradient(135deg, #052e16 0%, #166534 60%, #22c55e 100%)",                bundleKey: "mp_plus" },
  { key: "lime-burst",    label: "Lime Burst",     background: "radial-gradient(circle at 30% 30%, #84cc16, #15803d 50%, #052e16 100%)",        bundleKey: "mp_plus" },
  { key: "ocean",         label: "Ocean",          background: "linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 50%, #67e8f9 100%)",                bundleKey: "mp_plus" },
  { key: "deep-sea",      label: "Deep Sea",       background: "linear-gradient(135deg, #0a0a0a 0%, #1e3a8a 60%, #0ea5e9 100%)",                bundleKey: "mp_plus" },
  { key: "twilight",      label: "Twilight",       background: "linear-gradient(135deg, #312e81 0%, #6366f1 50%, #a78bfa 100%)",                bundleKey: "mp_plus" },
  { key: "ruby",          label: "Ruby",           background: "linear-gradient(135deg, #450a0a 0%, #dc2626 50%, #fca5a5 100%)",                bundleKey: "mp_plus" },
  { key: "phoenix",       label: "Phoenix",        background: "linear-gradient(135deg, #7f1d1d 0%, #f97316 50%, #fbbf24 100%)",                bundleKey: "mp_plus" },
  { key: "tropical",      label: "Tropical",       background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 50%, #fde68a 100%)",                bundleKey: "mp_plus" },
  { key: "lagoon",        label: "Lagoon",         background: "radial-gradient(ellipse at 40% 60%, #06b6d4, #155e75 60%, #083344 100%)",       bundleKey: "mp_plus" },
  { key: "indigo-haze",   label: "Indigo Haze",    background: "linear-gradient(135deg, #1e1b4b 0%, #3730a3 50%, #818cf8 100%)",                bundleKey: "mp_plus" },
  { key: "violet-storm",  label: "Violet Storm",   background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #c4b5fd 100%)",                bundleKey: "mp_plus" },
  { key: "court",         label: "Court",          background: "linear-gradient(135deg, #134e4a 0%, #0d9488 50%, #14b8a6 100%)",                bundleKey: "mp_plus" },
  { key: "asphalt",       label: "Asphalt",        background: "linear-gradient(135deg, #18181b 0%, #3f3f46 50%, #71717a 100%)",                bundleKey: "mp_plus" },
  { key: "stormy",        label: "Stormy",         background: "linear-gradient(135deg, #1e293b 0%, #475569 50%, #94a3b8 100%)",                bundleKey: "mp_plus" },
  { key: "sunrise",       label: "Sunrise",        background: "linear-gradient(135deg, #831843 0%, #f97316 50%, #fde68a 100%)",                bundleKey: "mp_plus" },
  { key: "mist",          label: "Mist",           background: "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 50%, #94a3b8 100%)",                bundleKey: "mp_plus" },
  { key: "rainbow-pastel",label: "Pastel Mesh",    background: "linear-gradient(135deg, #fda4af 0%, #fcd34d 25%, #6ee7b7 50%, #93c5fd 75%, #c4b5fd 100%)", bundleKey: "mp_plus" },
  // pack_neon (3)
  { key: "neon-violet",   label: "Neon Violet",    background: "linear-gradient(135deg, #1e1b4b 0%, #7c3aed 50%, #d946ef 100%)",                bundleKey: "pack_neon" },
  { key: "aurora",        label: "Aurora",         background: "linear-gradient(135deg, #064e3b 0%, #0ea5e9 35%, #a855f7 70%, #ec4899 100%)",   bundleKey: "pack_neon" },
  { key: "electric",      label: "Electric",       background: "linear-gradient(135deg, #0c0a09 0%, #6366f1 40%, #22d3ee 100%)",                bundleKey: "pack_neon" },
  // pack_gold (3)
  { key: "gold-rush",     label: "Gold Rush",      background: "radial-gradient(circle at 50% 50%, #fbbf24, #b45309 50%, #1c1917 100%)",        bundleKey: "pack_gold" },
  { key: "ember",         label: "Ember",          background: "linear-gradient(135deg, #0a0a0a 0%, #7c2d12 60%, #f97316 100%)",                bundleKey: "pack_gold" },
  { key: "sunset",        label: "Sunset",         background: "linear-gradient(135deg, #7c2d12 0%, #f97316 50%, #fbbf24 100%)",                bundleKey: "pack_gold" },
  // pack_carbon (3)
  { key: "midnight",      label: "Midnight",       background: "linear-gradient(180deg, #000000 0%, #1f1f23 60%, #3f3f46 100%)",                bundleKey: "pack_carbon" },
  { key: "graphite",      label: "Graphite",       background: "linear-gradient(135deg, #18181b 0%, #3f3f46 60%, #71717a 100%)",                bundleKey: "pack_carbon" },
  { key: "carbon",        label: "Carbon",         background: "radial-gradient(circle at 30% 30%, #27272a, #09090b 70%)",                      bundleKey: "pack_carbon" },
  // pack_sakura (3)
  { key: "sakura",        label: "Sakura",         background: "linear-gradient(135deg, #831843 0%, #ec4899 50%, #fbcfe8 100%)",                bundleKey: "pack_sakura" },
  { key: "candy",         label: "Candy",          background: "radial-gradient(circle at 70% 30%, #f0abfc, #d946ef 50%, #581c87 100%)",        bundleKey: "pack_sakura" },
  { key: "holographic",   label: "Holográfico",    background: "linear-gradient(135deg, #f0abfc 0%, #67e8f9 33%, #a7f3d0 66%, #fde68a 100%)",   bundleKey: "pack_sakura" },
];

// 10 card styles. 6 mp_plus, 4 en bundles.
export const CARD_STYLES: CardStyle[] = [
  {
    key: "classic",
    label: "Clásico",
    css: { background: "#fff", border: "1px solid var(--border)" },
    bundleKey: "mp_plus",
  },
  {
    key: "glass",
    label: "Glass",
    css: {
      background: "rgba(255,255,255,0.65)",
      border: "1px solid rgba(255,255,255,0.4)",
      backdropFilter: "blur(12px)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
    },
    bundleKey: "mp_plus",
  },
  {
    key: "frosted",
    label: "Frosted",
    css: {
      background: "rgba(241,245,249,0.7)",
      border: "1px solid rgba(255,255,255,0.5)",
      backdropFilter: "blur(16px) saturate(140%)",
      boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
    },
    bundleKey: "mp_plus",
  },
  {
    key: "paper",
    label: "Paper",
    css: {
      background: "#fafaf9",
      border: "1px solid #e7e5e4",
      boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04)",
    },
    bundleKey: "mp_plus",
  },
  {
    key: "soft-shadow",
    label: "Soft Shadow",
    css: {
      background: "#fff",
      border: "1px solid #f5f5f4",
      boxShadow: "0 18px 36px -16px rgba(15,23,42,0.18)",
    },
    bundleKey: "mp_plus",
  },
  {
    key: "outline",
    label: "Outline",
    css: { background: "#fff", border: "2px solid #0a0a0a", boxShadow: "4px 4px 0 #0a0a0a" },
    bundleKey: "mp_plus",
  },
  // pack_neon (1)
  {
    key: "neon-emerald",
    label: "Neon Emerald",
    css: {
      background: "linear-gradient(135deg, #064e3b, #052e16)",
      border: "1px solid #10b981",
      boxShadow: "0 0 24px rgba(16,185,129,0.35)",
      color: "#ecfdf5",
    },
    bundleKey: "pack_neon",
  },
  // pack_gold (1)
  {
    key: "holographic",
    label: "Holográfico",
    css: {
      background: "linear-gradient(135deg, #f0abfc 0%, #67e8f9 50%, #fde68a 100%)",
      border: "1px solid rgba(255,255,255,0.6)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
      color: "#0a0a0a",
    },
    bundleKey: "pack_gold",
  },
  // pack_carbon (1)
  {
    key: "carbon-deck",
    label: "Carbon Deck",
    css: {
      background: "linear-gradient(135deg, #18181b, #27272a)",
      border: "1px solid #3f3f46",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      color: "#fafafa",
    },
    bundleKey: "pack_carbon",
  },
  // pack_sakura (1)
  {
    key: "sakura-glass",
    label: "Sakura Glass",
    css: {
      background: "linear-gradient(135deg, rgba(251,207,232,0.6), rgba(244,114,182,0.4))",
      border: "1px solid rgba(255,255,255,0.5)",
      backdropFilter: "blur(12px)",
      boxShadow: "0 8px 24px rgba(236,72,153,0.18)",
      color: "#831843",
    },
    bundleKey: "pack_sakura",
  },
];

// Sets para validación rápida en server action.
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

// ── Temas (combos curados) ────────────────────────────────────────────────
// El jugador elige UN tema; no mezcla accent/card/banner por separado (combos
// libres salían feos). Cada tema setea los 3 campos de forma cohesiva y
// pertenece a un bundle (ownership). 'free' = default, disponible para todos.
// Ver docs/architecture/20-database.md §29.15-16 y product de personalización.
export type ProfileTheme = {
  key: string;
  label: string;
  bundleKey: string; // 'free' | 'mp_plus' | 'pack_*'
  accent: string | null;
  card: string | null;
  banner: string | null;
};

export const PROFILE_THEMES: ProfileTheme[] = [
  { key: "default",    label: "Clásico",     bundleKey: "free",        accent: null,        card: null,           banner: null },
  // MP+ (6)
  { key: "esmeralda",  label: "Esmeralda",   bundleKey: "mp_plus",     accent: "emerald",   card: "glass",        banner: "emerald-night" },
  { key: "oceano",     label: "Océano",      bundleKey: "mp_plus",     accent: "sky",       card: "frosted",      banner: "ocean" },
  { key: "crepusculo", label: "Crepúsculo",  bundleKey: "mp_plus",     accent: "violet",    card: "soft-shadow",  banner: "twilight" },
  { key: "bosque",     label: "Bosque",      bundleKey: "mp_plus",     accent: "green",     card: "paper",        banner: "forest" },
  { key: "rubi",       label: "Rubí",        bundleKey: "mp_plus",     accent: "rose",      card: "soft-shadow",  banner: "ruby" },
  { key: "pizarra",    label: "Pizarra",     bundleKey: "mp_plus",     accent: "slate",     card: "outline",      banner: "stormy" },
  // Packs (4)
  { key: "neon",       label: "Neón",        bundleKey: "pack_neon",   accent: "neon-mint", card: "neon-emerald", banner: "neon-violet" },
  { key: "oro",        label: "Oro",         bundleKey: "pack_gold",   accent: "amber",     card: "holographic",  banner: "gold-rush" },
  { key: "carbon",     label: "Carbón",      bundleKey: "pack_carbon", accent: "zinc",      card: "carbon-deck",  banner: "midnight" },
  { key: "sakura",     label: "Sakura",      bundleKey: "pack_sakura", accent: "pink",      card: "sakura-glass", banner: "sakura" },
];

export const THEME_KEYS = new Set(PROFILE_THEMES.map((t) => t.key));

export function findTheme(key: string | null | undefined): ProfileTheme | null {
  if (!key) return null;
  return PROFILE_THEMES.find((t) => t.key === key) ?? null;
}

// Dado el estado actual (accent/card/banner), devuelve el tema que matchea
// exactamente, o null si es un combo viejo no-temático.
export function themeFromState(
  accent: string | null,
  card: string | null,
  banner: string | null,
): ProfileTheme | null {
  return (
    PROFILE_THEMES.find((t) => t.accent === accent && t.card === card && t.banner === banner) ?? null
  );
}
