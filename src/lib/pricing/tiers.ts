// Source of truth for the /precios page: tier metadata, audience configs and
// the feature matrix cells. See UX spec `ux-spec` doc on MAT-25 §10.1 + §6.
//
// Tiers align with MAT-1 §1.5 monetization analysis.

export type Audience = "player" | "club" | "partner" | "coach";

export type AudienceSlug = "jugadores" | "clubes" | "partners" | "coaches";

export type BillingPeriod = "mensual" | "anual";

export type TelemetryBillingPeriod = "monthly" | "annual";

export type Highlight = "recommended" | "most-popular" | "enterprise" | null;

export type SalesPreset = {
  leadType: "club" | "partner" | "coach" | "other";
  message: string;
};

export type TierCta =
  | { kind: "link"; label: string; href: string; variant: "primary" | "outline" }
  | { kind: "contact"; label: string; preset: SalesPreset; variant: "primary" | "outline" };

/** Matrix cell. `true` → ✓, `false` → —, `string` → literal label. */
export type MatrixCell = boolean | string;

export type Tier = {
  key: string;
  audience: Audience;
  name: string;
  /** USD/month. `null` means "A medida" (custom pricing, no toggle). */
  monthly: number | null;
  /** Total annual price in USD. `null` means the tier isn't billable yearly. */
  annual: number | null;
  description: string;
  bullets: string[];
  cta: TierCta;
  highlight: Highlight;
  /** Optional sub-badge under the highlight ("Para clubes grandes", etc.). */
  subBadge?: string;
  /** Matrix cells keyed by `AudienceConfig.matrixRows[].key`. */
  matrix: Record<string, MatrixCell>;
};

export type MatrixRow = {
  key: string;
  label: string;
};

export type AudienceConfig = {
  audience: Audience;
  slug: AudienceSlug;
  heading: string;
  subCopy: string;
  /** Stable order for rendering tabs and sections. */
  order: number;
  cardCols: 2 | 3;
  matrixRows: MatrixRow[];
  /** When set, an embedded `<ContactSalesForm />` is rendered after the matrix. */
  embedSalesForm?: {
    leadType: "club" | "partner" | "coach" | "other";
    heading: string;
    description: string;
  };
};

export const BILLING_TO_TELEMETRY: Record<BillingPeriod, TelemetryBillingPeriod> = {
  mensual: "monthly",
  anual: "annual",
};

/** Discount factor applied when billing is annual. UX spec §5 — round to integer. */
export const ANNUAL_DISCOUNT_LABEL = "-20%";

export const TIERS: Tier[] = [
  // ───────── PLAYER ─────────
  {
    key: "player_free",
    audience: "player",
    name: "Free",
    monthly: 0,
    annual: 0,
    description: "Para empezar a jugar y descubrir clubes de tu ciudad.",
    bullets: [
      "Crear cuenta y perfil deportivo",
      "Reservar canchas en clubes activos",
      "Inscribirte a eventos y torneos abiertos",
      "Ranking básico nacional",
      "Mensajería con jugadores de tu zona",
    ],
    cta: { kind: "link", label: "Crear cuenta gratis", href: "/auth/signup", variant: "outline" },
    highlight: null,
    matrix: {
      account: true,
      reservations: true,
      events: true,
      ranking: "Básico",
      ranking_history: "30 días",
      match_seeks: "3",
      stats: false,
      quedadas: "1 activa · hasta 8",
      team_brand: false,
      exports: false,
      notif_premium: false,
      cosmetics: "precio normal",
      coach_ai: false,
      support: "Email",
    },
  },
  {
    key: "player_mp_plus",
    audience: "player",
    name: "MATCHPOINT+",
    monthly: 5,
    annual: 48,
    description: "Para quienes juegan varias veces por semana y arman partidos.",
    bullets: [
      "Todo lo del plan Free",
      "Match-seeks ilimitados (Free: 3 activos)",
      "Estadísticas históricas detalladas + 12 meses de ranking",
      "Crear quedadas pro y team-branding",
      "Notificaciones premium y alertas de tendencia",
      "50% off en packs de cosméticos",
    ],
    cta: {
      kind: "link",
      label: "Activar MATCHPOINT+",
      href: "/dashboard/user?upgrade=premium",
      variant: "primary",
    },
    highlight: "recommended",
    matrix: {
      account: true,
      reservations: true,
      events: true,
      ranking: "Premium + analytics",
      ranking_history: "12 meses",
      match_seeks: "Ilimitados",
      stats: true,
      quedadas: "Ilimitadas, sin tope",
      team_brand: true,
      exports: true,
      notif_premium: true,
      cosmetics: "50% off",
      coach_ai: true,
      support: "Prioritario",
    },
  },

  // ───────── CLUB ─────────
  {
    key: "club_starter",
    audience: "club",
    name: "Starter",
    monthly: 0,
    annual: 0,
    description: "Para clubes que recién están armando su agenda online.",
    bullets: [
      "Hasta 2 canchas activas",
      "Calendario de reservas",
      "Hasta 50 reservas/mes",
      "Soporte por email",
    ],
    cta: { kind: "link", label: "Empezar gratis", href: "/soy-club", variant: "outline" },
    highlight: null,
    matrix: {
      courts: "2",
      reservations: "50/mes",
      staff: false,
      checkin: false,
      club_events: false,
      pay_local: true,
      pay_stripe: false,
      commission: "0%",
      analytics: "Básico",
      branding: false,
      pos: false,
      api: false,
      support: "Email",
      onboarding: "Self-serve",
    },
  },
  {
    key: "club_pro",
    audience: "club",
    name: "Club Pro",
    monthly: 49,
    annual: 470,
    description: "Para clubes activos con varios deportes y empleados de mostrador.",
    bullets: [
      "Canchas y reservas ilimitadas",
      "Roster de empleados + check-in",
      "Aceptas transferencia y DeUna sin comisión (Stripe en Oct 2026)",
      "Eventos y torneos del club",
      "Reportes y analytics en tiempo real",
      "Soporte prioritario en WhatsApp",
    ],
    cta: { kind: "link", label: "Empezar plan Pro", href: "/soy-club?plan=pro", variant: "primary" },
    highlight: "most-popular",
    matrix: {
      courts: "Ilimitadas",
      reservations: "Ilimitadas",
      staff: true,
      checkin: true,
      club_events: true,
      pay_local: true,
      pay_stripe: true,
      commission: "0%",
      analytics: "Avanzado",
      branding: "Logo + colores",
      pos: false,
      api: false,
      support: "Prioritario WhatsApp",
      onboarding: "Asistido 48h",
    },
  },
  {
    key: "club_premium",
    audience: "club",
    name: "Club Premium",
    monthly: 149,
    annual: 1432,
    description: "Cadenas y clubes high-volume con branding propio.",
    bullets: [
      "Todo lo del plan Pro",
      "Branding completo en tu club page",
      "Analytics avanzados (ocupación, retención, ingresos)",
      "Integración POS",
      "Tier API + webhooks",
      "Account manager dedicado",
    ],
    cta: {
      kind: "contact",
      label: "Hablar con ventas",
      variant: "outline",
      preset: { leadType: "club", message: "Plan Club Premium" },
    },
    highlight: "enterprise",
    subBadge: "Para clubes grandes",
    matrix: {
      courts: "Ilimitadas",
      reservations: "Ilimitadas",
      staff: true,
      checkin: true,
      club_events: true,
      pay_local: true,
      pay_stripe: true,
      commission: "0%",
      analytics: "Avanzado + ocupación + retención",
      branding: "Completo (white-label parcial)",
      pos: true,
      api: true,
      support: "Account manager dedicado",
      onboarding: "Personalizado",
    },
  },

  // ───────── PARTNER ─────────
  {
    key: "partner_free",
    audience: "partner",
    name: "Free",
    monthly: 0,
    annual: 0,
    description: "Para probar el formato y validar tu torneo.",
    bullets: [
      "Hasta 2 torneos al año",
      "Brackets básicos",
      "Comisión 10% sobre inscripciones",
      "Listado en /eventos",
    ],
    cta: { kind: "link", label: "Crear torneo gratis", href: "/soy-partner", variant: "outline" },
    highlight: null,
    matrix: {
      tournaments_year: "2",
      commission: "10%",
      brackets_basic: true,
      brackets_premium: false,
      featured: false,
      multi_club: false,
      analytics: false,
      circuit_ranking: false,
      promo: false,
      support: "Email",
    },
  },
  {
    key: "partner_pro",
    audience: "partner",
    name: "Partner Pro",
    monthly: 50,
    annual: 480,
    description: "Para circuitos, ligas y organizadores con calendario activo.",
    bullets: [
      "Torneos y categorías ilimitados",
      "Comisión 5% sobre inscripciones (vs 10% Free)",
      "Brackets premium (Swiss, doble eliminación con plata)",
      "1 torneo featured destacado por mes",
      "Analytics: asistencia, retención, ingresos",
      "Multi-club bajo un mismo brand",
    ],
    cta: {
      kind: "contact",
      label: "Hablar con ventas",
      variant: "primary",
      preset: { leadType: "partner", message: "Partner Pro" },
    },
    highlight: "recommended",
    matrix: {
      tournaments_year: "Ilimitados",
      commission: "5%",
      brackets_basic: true,
      brackets_premium: true,
      featured: "1 / mes",
      multi_club: true,
      analytics: true,
      circuit_ranking: true,
      promo: "Newsletter + push",
      support: "Prioritario",
    },
  },

  // ───────── COACH ─────────
  {
    key: "coach_free",
    audience: "coach",
    name: "Free",
    monthly: 0,
    annual: 0,
    description: "Aparece en el directorio y consigue tus primeros alumnos.",
    bullets: [
      "Perfil público en /coaches",
      "Hasta 3 clases agendadas/mes",
      "Comisión 20% sobre clases",
      "Soporte por email",
    ],
    cta: { kind: "link", label: "Crear perfil de coach", href: "/coaches", variant: "outline" },
    highlight: null,
    matrix: {
      directory: true,
      classes_month: "3",
      commission: "20%",
      badge: false,
      featured_position: false,
      calendar_sync: false,
      video_feedback: false,
      drill_library: false,
      eval_templates: false,
      analytics: false,
      support: "Email",
    },
  },
  {
    key: "coach_verified",
    audience: "coach",
    name: "Coach Verified",
    monthly: 15,
    annual: 144,
    description: "Badge verificado, prioridad en búsquedas y mejor comisión.",
    bullets: [
      "Badge verificado visible",
      "Posición destacada en /coaches",
      "Clases ilimitadas",
      "Comisión 10% (vs 20% Free)",
      "Soporte prioritario",
    ],
    cta: {
      kind: "link",
      label: "Activar Coach Verified",
      href: "/coaches?upgrade=verified",
      variant: "primary",
    },
    highlight: "most-popular",
    matrix: {
      directory: true,
      classes_month: "Ilimitadas",
      commission: "10%",
      badge: true,
      featured_position: true,
      calendar_sync: false,
      video_feedback: false,
      drill_library: false,
      eval_templates: false,
      analytics: false,
      support: "Prioritario",
    },
  },
  {
    key: "coach_pro",
    audience: "coach",
    name: "Coach Pro",
    monthly: 35,
    annual: 336,
    description: "Para coaches que viven de enseñar — herramientas completas.",
    bullets: [
      "Todo lo de Coach Verified",
      "Comisión 7% (vs 10% Verified)",
      "Biblioteca de drills y plantillas de evaluación",
      "Calendario sync (Google · iCal)",
      "Subida de video y feedback",
      "Analytics de alumnos",
    ],
    cta: { kind: "link", label: "Activar Coach Pro", href: "/coaches?upgrade=pro", variant: "outline" },
    highlight: null,
    subBadge: "Para coaches a tiempo completo",
    matrix: {
      directory: true,
      classes_month: "Ilimitadas",
      commission: "7%",
      badge: true,
      featured_position: "Top",
      calendar_sync: true,
      video_feedback: true,
      drill_library: true,
      eval_templates: true,
      analytics: true,
      support: "Account contact",
    },
  },
];

export const AUDIENCES: AudienceConfig[] = [
  {
    audience: "player",
    slug: "jugadores",
    order: 1,
    cardCols: 2,
    heading: "Para jugadores",
    subCopy: "Activas MP+ desde tu dashboard. Cancelas cuando quieras.",
    matrixRows: [
      { key: "account", label: "Crear cuenta y perfil deportivo" },
      { key: "reservations", label: "Reservar canchas en clubes activos" },
      { key: "events", label: "Inscribirte a eventos/torneos abiertos" },
      { key: "ranking", label: "Ranking nacional" },
      { key: "ranking_history", label: "Histórico de ranking" },
      { key: "match_seeks", label: "Match-seeks activos" },
      { key: "stats", label: "Estadísticas detalladas" },
      { key: "quedadas", label: "Crear quedadas (pickups)" },
      { key: "team_brand", label: "Team-branding" },
      { key: "exports", label: "Exportar partidos" },
      { key: "notif_premium", label: "Notificaciones premium" },
      { key: "cosmetics", label: "Cosméticos one-time" },
      { key: "coach_ai", label: "Coach AI (cuando esté disponible)" },
      { key: "support", label: "Soporte" },
    ],
  },
  {
    audience: "club",
    slug: "clubes",
    order: 2,
    cardCols: 3,
    heading: "Para clubes",
    subCopy: "Solo pagas la suscripción del plan; sin porcentaje por reserva.",
    embedSalesForm: {
      leadType: "club",
      heading: "¿No estás seguro de qué plan elegir?",
      description: "Cuéntanos sobre tu club y te recomendamos el plan correcto.",
    },
    matrixRows: [
      { key: "courts", label: "Canchas activas" },
      { key: "reservations", label: "Reservas mensuales" },
      { key: "staff", label: "Roster de empleados" },
      { key: "checkin", label: "Check-in en mostrador" },
      { key: "club_events", label: "Eventos y torneos del club" },
      { key: "pay_local", label: "Pagos por transferencia + DeUna" },
      { key: "pay_stripe", label: "Cobro automático con Stripe (Oct 2026)" },
      { key: "commission", label: "Comisión por reserva del club" },
      { key: "analytics", label: "Reportes y analytics" },
      { key: "branding", label: "Branding propio en club page" },
      { key: "pos", label: "Integración POS" },
      { key: "api", label: "Tier API + webhooks" },
      { key: "support", label: "Soporte" },
      { key: "onboarding", label: "Onboarding" },
    ],
  },
  {
    audience: "partner",
    slug: "partners",
    order: 3,
    cardCols: 2,
    heading: "Para partners",
    subCopy: "Organizadores que corren torneos en múltiples clubes o ciudades.",
    embedSalesForm: {
      leadType: "partner",
      heading: "¿Calendario de torneos pesado?",
      description: "Te ayudamos a estructurar el circuito y el precio que mejor te calza.",
    },
    matrixRows: [
      { key: "tournaments_year", label: "Torneos por año" },
      { key: "commission", label: "Comisión sobre inscripciones" },
      { key: "brackets_basic", label: "Brackets básicos (eliminación simple)" },
      { key: "brackets_premium", label: "Brackets premium (Swiss, doble elim)" },
      { key: "featured", label: "Torneos featured destacados" },
      { key: "multi_club", label: "Multi-club bajo mismo brand" },
      { key: "analytics", label: "Analytics de torneo" },
      { key: "circuit_ranking", label: "Ranking propio (circuito)" },
      { key: "promo", label: "Promoción cruzada en MATCHPOINT" },
      { key: "support", label: "Soporte" },
    ],
  },
  {
    audience: "coach",
    slug: "coaches",
    order: 4,
    cardCols: 3,
    heading: "Para coaches",
    subCopy: "Verifica tu perfil y vive del pickleball.",
    matrixRows: [
      { key: "directory", label: "Perfil público en directorio" },
      { key: "classes_month", label: "Clases agendadas/mes" },
      { key: "commission", label: "Comisión sobre clases" },
      { key: "badge", label: "Badge verificado" },
      { key: "featured_position", label: "Posición destacada en /coaches" },
      { key: "calendar_sync", label: "Calendario sync" },
      { key: "video_feedback", label: "Subida de video y feedback" },
      { key: "drill_library", label: "Biblioteca de drills" },
      { key: "eval_templates", label: "Plantillas de evaluación" },
      { key: "analytics", label: "Analytics de alumnos" },
      { key: "support", label: "Soporte" },
    ],
  },
];

export const COSMETICS_CALLOUT = {
  eyebrow: "Cosméticos · one-time",
  heading: "Personaliza tu perfil con packs de $4–5.",
  body: "Marcos, banners, badges y emotes. 50% off si tienes MATCHPOINT+.",
  href: "/dashboard/user/cosmeticos",
  ctaLabel: "Ver packs",
} as const;

export type FaqItem = {
  key: string;
  question: string;
  answer: string;
};

export type FaqGroup = {
  audience: Audience | "payments";
  title: string;
  items: FaqItem[];
};

export const FAQ_GROUPS: FaqGroup[] = [
  {
    audience: "player",
    title: "Jugadores",
    items: [
      {
        key: "no_card",
        question: "¿Necesito tarjeta para empezar?",
        answer:
          "No. Crea cuenta gratis sin método de pago. Activas MATCHPOINT+ solo si lo decides, con transferencia o DeUna.",
      },
      {
        key: "activate_mp_plus",
        question: "¿Cómo activo MATCHPOINT+?",
        answer:
          "Desde tu dashboard pides el upgrade, haces la transferencia o DeUna, subes el comprobante y nosotros lo aprobamos en menos de 24 horas hábiles. Tu plan queda activo 30 días desde la aprobación. Desde Octubre 2026 podrás también pagar con tarjeta y la activación es instantánea.",
      },
      {
        key: "cancel_anytime",
        question: "¿Puedo cancelar cuando quiera?",
        answer:
          "Sí, sin permanencia. Si bajas de MP+ a Free, el resto del mes pagado sigue activo hasta la fecha de vencimiento.",
      },
      {
        key: "data_if_leave",
        question: "¿Qué pasa con mis datos si me voy?",
        answer:
          "Tu perfil queda en Free. Tu historial de partidos, ranking y reservas se conservan. Puedes exportar todo desde \"Configuración → Datos\".",
      },
    ],
  },
  {
    audience: "club",
    title: "Clubes",
    items: [
      {
        key: "club_commission",
        question: "¿MATCHPOINT cobra comisión por reserva o pago del club?",
        answer:
          "No. Solo pagas la suscripción de tu plan. Cada reserva o cobro que recibe el club te llega íntegro. La única take-rate de MATCHPOINT es sobre inscripciones a torneos (al jugador, no al club) y clases de coaches (al alumno, no al club).",
      },
      {
        key: "club_collect_today",
        question: "¿Cómo se cobra hoy a los jugadores en mi club?",
        answer:
          "Por transferencia bancaria o DeUna. El jugador sube comprobante y un admin de tu club lo aprueba desde el panel. Desde Octubre 2026 activamos cobro automático con Stripe Connect — sin cambios para ti, el dinero entra directo a tu cuenta bancaria con payout semanal.",
      },
      {
        key: "club_setup_time",
        question: "¿Cuánto demora el setup?",
        answer:
          "48 horas en la mayoría de casos. Nuestro equipo carga tus canchas, horarios y tarifas iniciales. Te enseñamos a usar el panel en una sesión de 30 minutos.",
      },
      {
        key: "club_invoices",
        question: "¿Facturas SRI / RUC?",
        answer:
          "Sí, MATCHPOINT factura desde Ecuador con RUC válido. Recibes factura electrónica mensual de tu plan automáticamente.",
      },
      {
        key: "club_chain_discount",
        question: "¿Hay descuento por volumen para cadenas de clubes (3+ sedes)?",
        answer:
          "Sí. Coordina con ventas — hablamos descuentos por número de sedes y precio combinado de planes Pro / Premium.",
      },
    ],
  },
  {
    audience: "partner",
    title: "Partners y Coaches",
    items: [
      {
        key: "partner_first_tournament",
        question: "¿Necesito ser Partner Pro para correr mi primer torneo?",
        answer:
          "No. Con Free puedes correr hasta 2 torneos al año con la comisión estándar de 10% sobre inscripciones. Subes a Partner Pro cuando el calendario te lo exija.",
      },
      {
        key: "coach_verified_vs_pro",
        question: "¿Cuál es la diferencia entre Coach Verified y Coach Pro?",
        answer:
          "Verified te da badge, prioridad en búsquedas y baja la comisión a 10%. Pro suma herramientas (biblioteca de drills, calendario sync, video feedback) y baja la comisión a 7%. Si das ≥5 clases por semana, Pro se paga sola.",
      },
    ],
  },
  {
    audience: "payments",
    title: "Pagos y facturación",
    items: [
      {
        key: "stripe_plan_b",
        question: "¿Qué pasa si Stripe no está disponible en Ecuador a tiempo?",
        answer:
          "Plan B activo: si Stripe rechaza Ecuador como plataforma (hoy en validación con su equipo), migramos a Kushki sin cambiar las promesas de esta página — sigue siendo cobro automático con tarjeta, solo el rail técnico cambia. El copy se actualizará si hay retraso material.",
      },
    ],
  },
];

/**
 * Compute the per-month price shown on a tier card given a billing period.
 * Annual = round(annual / 12). Mensual = monthly. Returns null for "A medida".
 */
export function effectiveMonthlyPrice(tier: Tier, billing: BillingPeriod): number | null {
  if (tier.monthly === null) return null;
  if (billing === "anual" && tier.annual !== null && tier.annual > 0) {
    return Math.round(tier.annual / 12);
  }
  return tier.monthly;
}

/** Savings for the annual plan vs paying monthly for 12 months. */
export function annualSavings(tier: Tier): number {
  if (tier.monthly === null || tier.annual === null || tier.monthly === 0) return 0;
  return Math.max(0, tier.monthly * 12 - tier.annual);
}

export function tiersForAudience(audience: Audience): Tier[] {
  return TIERS.filter((t) => t.audience === audience);
}

export function audienceBySlug(slug: string): AudienceConfig | null {
  return AUDIENCES.find((a) => a.slug === slug) ?? null;
}
