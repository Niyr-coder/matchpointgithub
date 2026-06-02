/**
 * Degradados de superficie dashboard.
 * Patrón: radial en esquina inferior derecha + linear 135° (Quedadas lista + gestión).
 * Mantener en sync con `--mp-gradient-*` en `globals.css`.
 */

/** Hero Quedadas (lista + panel gestión) — acento violeta. */
export const MP_GRADIENT_HERO_QUEDADAS =
  "radial-gradient(115% 130% at 98% 112%, rgba(124,58,237,0.3) 0%, rgba(124,58,237,0) 52%), linear-gradient(135deg, #0a0a0a 0%, #18162e 58%, #3b0764 100%)";

/** Mismo patrón, acento social verde (KPI / Tu red en Compañeros). */
export const MP_GRADIENT_SURFACE_SOCIAL_DARK =
  "radial-gradient(115% 130% at 98% 112%, rgba(16,185,129,0.28) 0%, rgba(16,185,129,0) 52%), linear-gradient(135deg, #0a0a0a 0%, #052e22 58%, #064e3b 100%)";

/** Mismo patrón en superficie clara — acento ámbar MP+. */
export const MP_GRADIENT_SURFACE_PREMIUM_LIGHT =
  "radial-gradient(115% 130% at 98% 112%, rgba(251,191,36,0.24) 0%, rgba(251,191,36,0) 52%), linear-gradient(135deg, #fafafa 0%, #f4f4f5 58%, #ffffff 100%)";

/** Mismo patrón en superficie oscura — acento ámbar MP+ (SmartMatches en dark mode). */
export const MP_GRADIENT_SURFACE_PREMIUM_DARK =
  "radial-gradient(115% 130% at 98% 112%, rgba(251,191,36,0.28) 0%, rgba(251,191,36,0) 52%), linear-gradient(135deg, #0a0a0a 0%, #1c1910 58%, #422006 100%)";

