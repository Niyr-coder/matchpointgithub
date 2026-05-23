// Registro de feature flags conocidos por el código (fuente de verdad).
//
// Un flag en la tabla `feature_flags` solo "hace algo" si el código pregunta por
// su key (vía fn_my_effective_flags / getMyEffectiveFlags). Este registro lista
// los flags que el código REALMENTE lee, con qué controlan y dónde aplican, para
// que el panel admin no sea a ciegas: crear/editar flags informados y detectar
// huérfanos (flags en DB que ningún código usa).
//
// CUANDO AGREGUES UN FLAG NUEVO EN EL CÓDIGO: regístralo acá (key idéntica a la
// que consulta el código). Así aparece como sugerencia en "Nuevo flag" y deja de
// marcarse como huérfano.
//
// Es un módulo de datos puro (sin "server-only") → importable desde cliente.

export type KnownFlag = {
  key: string;
  label: string;
  /** Qué controla, en español sencillo. */
  description: string;
  /** Superficies/archivos donde el código lo lee (o lo leería). */
  surfaces: string[];
  impact: "low" | "med" | "high";
  /**
   * true  = el código YA lee esta key (el flag tiene efecto real).
   * false = registrado/planeado, pero el código todavía no lo consulta
   *         (crear el flag no hará nada hasta cablear el chequeo).
   */
  wired: boolean;
};

export const KNOWN_FLAGS: KnownFlag[] = [
  // ── Cableados (el código ya los lee) ──────────────────────────────────
  {
    key: "match_seeks_enabled",
    label: "Busco partido",
    description: "Habilita la feature \"Busco partido\": publicar solicitudes de partido y responderlas. Apagado = la pantalla queda oculta/no disponible.",
    surfaces: ["Busco partido (user)", "match-seeks (server)"],
    impact: "med",
    wired: true,
  },
  {
    key: "match_reliability_enabled",
    label: "Fiabilidad de partidos",
    description: "Activa el sistema de fiabilidad (confirmaciones, no-shows) en partidos y en el chat de mensajes.",
    surfaces: ["Partidos", "Mensajes"],
    impact: "med",
    wired: true,
  },

  // ── Registrados, pendientes de cablear (rollout planeado) ─────────────
  {
    key: "coach_ai_enabled",
    label: "Coach AI",
    description: "Análisis de video y sugerencias tácticas con IA. Pensado para liberar gradualmente a usuarios MATCHPOINT+.",
    surfaces: ["Coach AI (sidebar + pantalla)"],
    impact: "med",
    wired: true,
  },
  {
    key: "quedadas_enabled",
    label: "Quedadas",
    description: "El juego social (Quedadas): organizar partidos informales, formatos, resultados y ranking opcional.",
    surfaces: ["Quedadas (sidebar + pantalla)"],
    impact: "med",
    wired: true,
  },
  {
    key: "club_memberships_v2",
    label: "Membresías de club",
    description: "Sistema de membresías/socios de club (planes, cobros, aprobación). Para encender por clubes piloto vía excepción.",
    surfaces: ["Club/Owner/Manager · Membresías (sidebar + pantalla)"],
    impact: "med",
    wired: true,
  },
  {
    key: "signups_open",
    label: "Registro abierto",
    description: "Permite el registro de usuarios nuevos. Apagar = cerrar registros temporalmente (mantenimiento, lanzamiento por olas).",
    surfaces: ["signUp action (auth.ts)"],
    impact: "high",
    wired: true,
  },
  {
    key: "maintenance_banner",
    label: "Banner de mantenimiento",
    description: "Muestra un aviso de mantenimiento en la parte superior del dashboard para todos los roles. El texto del aviso es la descripción de este flag.",
    surfaces: ["Dashboard (layout)", "DashboardChrome"],
    impact: "high",
    wired: true,
  },
];

const MAP: Record<string, KnownFlag> = Object.fromEntries(KNOWN_FLAGS.map((f) => [f.key, f]));

/** Devuelve la metadata del flag si el código lo conoce, o undefined (huérfano). */
export function knownFlag(key: string): KnownFlag | undefined {
  return MAP[key];
}

/** Flags conocidos que todavía NO existen en la DB (sugerencias para crear). */
export function uncreatedKnownFlags(existingKeys: string[]): KnownFlag[] {
  const set = new Set(existingKeys);
  return KNOWN_FLAGS.filter((f) => !set.has(f.key));
}
