import type { CSSProperties } from "react";

export type PlayerToneKey = "quedada" | "torneo";

export type PlayerTone = {
  name: string;
  sub: string;
  icon: string;
  chipBg: string;
  chipBorder: string;
  chipDot: string;
  chipFg: string;
  accent: string;
  accentDot: string;
  accentDark: string;
  accentLight: string;
  accentLightFg: string;
  wordmark: string;
  headerStyle: CSSProperties;
  nextHeaderStyle: CSSProperties;
  nextChipBg: string;
  nextChipFg: string;
};

export const PLAYER_TONES: Record<PlayerToneKey, PlayerTone> = {
  quedada: {
    name: "Quedada",
    sub: "Social · libre",
    icon: "users-round",
    chipBg: "rgba(52,211,153,0.18)",
    chipBorder: "rgba(52,211,153,0.30)",
    chipDot: "#34d399",
    chipFg: "#d1fae5",
    accent: "#10b981",
    accentDot: "#34d399",
    accentDark: "#047857",
    accentLight: "#ecfdf5",
    accentLightFg: "#047857",
    wordmark: "QUEDA",
    headerStyle: {
      background:
        "radial-gradient(115% 130% at 98% 112%, rgba(16,185,129,0.28) 0%, rgba(16,185,129,0) 52%), linear-gradient(135deg, #0a0a0a 0%, #052e22 60%, #064e3b 100%)",
    },
    nextHeaderStyle: {
      background: "linear-gradient(135deg, #0a0a0a 0%, #0c2519 60%, #065f46 100%)",
      border: "1px solid rgba(52,211,153,0.22)",
    },
    nextChipBg: "rgba(52,211,153,0.18)",
    nextChipFg: "#86efac",
  },
  torneo: {
    name: "Torneo",
    sub: "Oficial · competitivo",
    icon: "trophy",
    chipBg: "var(--torneo-chip-bg)",
    chipBorder: "rgba(251,191,36,0.30)",
    chipDot: "var(--torneo-accent)",
    chipFg: "var(--torneo-chip-fg)",
    accent: "var(--torneo-accent)",
    accentDot: "var(--torneo-accent)",
    accentDark: "var(--torneo-light-fg)",
    accentLight: "var(--torneo-light)",
    accentLightFg: "var(--torneo-light-fg)",
    wordmark: "TORNEO",
    headerStyle: {
      background:
        "radial-gradient(115% 130% at 98% 112%, var(--torneo-glow) 0%, rgba(245,158,11,0) 52%), linear-gradient(135deg, #0a0a0a 0%, var(--torneo-grad-mid) 60%, var(--torneo-grad-end) 100%)",
    },
    nextHeaderStyle: {
      background: "linear-gradient(135deg, #0a0a0a 0%, #1c1410 60%, #78350f 100%)",
      border: "1px solid rgba(251,191,36,0.26)",
    },
    nextChipBg: "rgba(251,191,36,0.20)",
    nextChipFg: "var(--torneo-accent-soft)",
  },
};
