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
    key: "club_marketing_enabled",
    label: "Marketing de club",
    description: "Habilita Marketing del club (campañas, broadcasts a clientes). Apagado = oculto del sidebar y pantalla no disponible.",
    surfaces: ["Owner · Marketing (sidebar + pantalla)"],
    impact: "med",
    wired: true,
  },
  {
    key: "club_giveaways_enabled",
    label: "Sorteos del club",
    description:
      "Habilita sorteos v2: feed del club con giveaways, Mis sorteos (jugador), panel Sorteos (owner/manager) y flujos de participación. Apagado = kill switch global.",
    surfaces: [
      "ClubProfileView",
      "mis-sorteos / club-sorteos (sidebar)",
      "/dashboard/clubes/giveaways/*",
      "src/server/actions/giveaways.ts",
    ],
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
  {
    key: "read_only_mode",
    label: "Modo solo lectura",
    description: "Kill switch global: bloquea mutaciones sensibles (inscripciones, pagos, scoring) pero deja navegación. Más fuerte que el banner de mantenimiento.",
    surfaces: ["pending: middleware o guard en server actions críticas"],
    impact: "high",
    wired: false,
  },

  // ── Juego social / matchmaking ─────────────────────────────────────────
  // Sembrados en false. Cuando un caller los cablea con requirePlanWithFlag,
  // marcar wired=true y agregar la superficie correspondiente.
  {
    key: "paywall_enforce_coach_ai",
    label: "Paywall · Coach AI",
    description: "Encendido = solo usuarios MATCHPOINT+ pueden usar Coach AI. Apagado = todos pueden (estado inicial).",
    surfaces: ["pending: src/components/dashboard/user/CoachAIScreen.tsx + server action"],
    impact: "med",
    wired: false,
  },
  {
    key: "paywall_enforce_player_history",
    label: "Paywall · Historial de perfil ajeno",
    description: "Encendido = free ve solo 10 partidos en perfiles ajenos; premium ilimitado. Apagado = todos ven sin cap.",
    surfaces: ["pending: src/app/players/[username]/page.tsx"],
    impact: "low",
    wired: false,
  },
  {
    key: "paywall_enforce_match_seek_cap",
    label: "Paywall · Cap de busco-partido",
    description: "Encendido = free limitado a N avisos simultáneos (platform_config.match_seek_max_open_per_user); premium ilimitado.",
    surfaces: ["pending: src/server/actions/match-seeks.ts"],
    impact: "low",
    wired: false,
  },
  {
    key: "paywall_enforce_profile_customization",
    label: "Paywall · Personalización de perfil",
    description: "Encendido = accent/banner/card avanzados solo para premium o bundles. Free usa presets por defecto.",
    surfaces: ["pending: personalización de perfil"],
    impact: "low",
    wired: false,
  },
  {
    key: "paywall_enforce_club_finanzas_advanced",
    label: "Paywall · Club Finanzas avanzado",
    description: "Encendido = analytics avanzados (heatmap, cohorts, export histórico) solo para clubes con plan Pro.",
    surfaces: ["pending: src/components/dashboard/club/ClubFinanzasScreen.tsx"],
    impact: "med",
    wired: false,
  },
  {
    key: "paywall_enforce_club_marketing",
    label: "Paywall · Club Marketing",
    description: "Encendido = sección Marketing del club solo para MP Club Pro. Combina con el flag pre-existente club_marketing_enabled (kill-switch global).",
    surfaces: ["pending: src/components/dashboard/owner/ClubMarketingScreen.tsx"],
    impact: "med",
    wired: false,
  },
  {
    key: "paywall_enforce_club_memberships",
    label: "Paywall · Membresías de club",
    description: "Encendido = motor de membresías solo para MP Club Pro. Combina con club_memberships_v2 (kill-switch global).",
    surfaces: ["pending: src/components/dashboard/club/ClubMembresiasScreen.tsx"],
    impact: "med",
    wired: false,
  },
  {
    key: "paywall_enforce_partner_tournaments_cap",
    label: "Paywall · Cap de torneos para partner",
    description: "Encendido = partners free limitados a N torneos activos simultáneos; premium ilimitado.",
    surfaces: ["pending: src/server/actions/tournaments.ts (createTournament)"],
    impact: "med",
    wired: false,
  },

  // ── Legacy / huérfanos en DB ───────────────────────────────────────────
  {
    key: "profile_customization",
    label: "Personalización de perfil (legacy)",
    description: "Kill switch antiguo (mig 113). El código ya no lee esta key; usar paywall_enforce_profile_customization cuando se cablee el paywall. Candidato a deprecar en DB.",
    surfaces: ["(ninguna — huérfano)"],
    impact: "low",
    wired: false,
  },

  // ── Recomendados: crear en DB cuando se cableen ────────────────────────
  {
    key: "user_teams_enabled",
    label: "Teams de jugadores",
    description: "Habilita crear/unirse a teams, discovery y pantallas de equipo. Apagado = ocultar del sidebar y bloquear mutaciones.",
    surfaces: ["pending: TeamScreen, sidebar user, server/actions/teams"],
    impact: "med",
    wired: false,
  },
  {
    key: "native_sponsors_enabled",
    label: "Patrocinios nativos",
    description: "Renderiza placements de sponsors en slots de la app (home, listados, etc.). Apagado = no se muestran creatives aunque existan en admin.",
    surfaces: ["pending: componentes de placement + slots publicados"],
    impact: "med",
    wired: false,
  },
  {
    key: "shop_enabled",
    label: "Tienda / Pro shop",
    description: "Habilita la tienda en dashboard jugador y flujos de compra del pro shop.",
    surfaces: ["pending: ShopScreen, EmployeeProShopScreen"],
    impact: "med",
    wired: false,
  },
  {
    key: "payments_capture_enabled",
    label: "Captura de pagos",
    description: "Kill switch de pagos: apagado = no se crean nuevas transacciones captured ni comprobantes pending (mantenimiento de cobros).",
    surfaces: ["pending: payment-proofs, inscripciones, player-subscriptions"],
    impact: "high",
    wired: false,
  },
];

const MAP: Record<string, KnownFlag> = Object.fromEntries(KNOWN_FLAGS.map((f) => [f.key, f]));
const KNOWN_ORDER = new Map(KNOWN_FLAGS.map((f, i) => [f.key, i]));

/** Prioridad de fila en admin: features cableadas → planeadas → paywalls → huérfanos. */
function flagSortRank(key: string, known?: KnownFlag): number {
  if (!known) return 400;
  if (key.startsWith("paywall_")) return known.wired ? 300 : 320;
  return known.wired ? 100 : 200;
}

/** Orden canónico para la tabla de admin (alineado al registro del código). */
export function sortFlagsByRegistry<T extends { k: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = flagSortRank(a.k, knownFlag(a.k));
    const rb = flagSortRank(b.k, knownFlag(b.k));
    if (ra !== rb) return ra - rb;
    const oa = KNOWN_ORDER.get(a.k) ?? 999;
    const ob = KNOWN_ORDER.get(b.k) ?? 999;
    if (oa !== ob) return oa - ob;
    return a.k.localeCompare(b.k, "es");
  });
}

/** Devuelve la metadata del flag si el código lo conoce, o undefined (huérfano). */
export function knownFlag(key: string): KnownFlag | undefined {
  return MAP[key];
}

/** Flags conocidos que todavía NO existen en la DB (sugerencias para crear). */
export function uncreatedKnownFlags(existingKeys: string[]): KnownFlag[] {
  const set = new Set(existingKeys);
  return KNOWN_FLAGS.filter((f) => !set.has(f.key));
}
