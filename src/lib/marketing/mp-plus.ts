export const MP_PLUS_PLAN = {
  name: "MATCHPOINT+",
  shortName: "MP+",
  tierKey: "matchpoint_plus",
  priceCents: 699,
  priceAmountLabel: "USD 6.99",
  priceLabel: "USD 6.99/mes",
  paymentShort: "Transferencia o DeUna · sin cobro automático",
  paymentHint:
    "Solicitas el plan, subes el comprobante y el equipo lo aprueba manualmente.",
  requestCta: "Solicitar MATCHPOINT+",
  renewCta: "Solicitar renovación",
} as const;

export type MpPlusBenefit = {
  icon: string;
  title: string;
  description: string;
};

export const MP_PLUS_CORE_BENEFITS: MpPlusBenefit[] = [
  {
    icon: "users",
    title: "Teams con más margen",
    description:
      "Roster de hasta 24 jugadores, más invitaciones pendientes y más cambios de nombre para capitanes.",
  },
  {
    icon: "sparkles",
    title: "Coach AI en vista previa",
    description:
      "Early access al laboratorio de análisis táctico con datos demo mientras se construye el backend real.",
  },
  {
    icon: "line-chart",
    title: "Más contexto deportivo",
    description:
      "Historial de perfil completo y superficies de ranking preparadas para insights avanzados.",
  },
];

export const MP_PLUS_MODAL_BENEFITS: MpPlusBenefit[] = [
  {
    icon: "users",
    title: "Teams con límites más altos",
    description: "Roster de 24 jugadores, más invitaciones pendientes y más cambios de nombre.",
  },
  {
    icon: "sparkles",
    title: "Coach AI · vista previa",
    description: "Acceso anticipado a la experiencia mock de análisis táctico.",
  },
  {
    icon: "crown",
    title: "Identidad MATCHPOINT+",
    description: "Badge de plan activo y beneficios visibles en superficies del dashboard.",
  },
];

export type MpPlusComparisonRow = {
  label: string;
  free: string;
  plus: string;
  highlight?: boolean;
};

export type MpPlusBenefitCategory = {
  title: string;
  hint?: string;
  available: boolean;
  rows: MpPlusComparisonRow[];
};

export const MP_PLUS_BENEFIT_CATEGORIES: MpPlusBenefitCategory[] = [
  {
    title: "Teams",
    hint: "Crear y unirse a teams es gratis; MATCHPOINT+ amplía los límites para capitanes.",
    available: true,
    rows: [
      { label: "Miembros del roster", free: "12", plus: "24", highlight: true },
      { label: "Invitaciones pendientes", free: "3", plus: "Sin tope definido", highlight: true },
      { label: "Cambios de nombre", free: "2 veces", plus: "5 veces" },
      { label: "Estadísticas de team", free: "Básicas", plus: "Avanzadas" },
    ],
  },
  {
    title: "Coach AI",
    hint: "Vista previa con datos mock. El procesamiento real de video todavía está en roadmap.",
    available: true,
    rows: [
      { label: "Acceso al laboratorio", free: "Vista bloqueada", plus: "Early access", highlight: true },
      { label: "Análisis de video real", free: "—", plus: "Próximamente" },
      { label: "Drills y progreso", free: "—", plus: "Demo de producto" },
    ],
  },
  {
    title: "Perfil y ranking",
    hint: "Beneficios ligados a superficies ya gateadas o preparadas para MATCHPOINT+.",
    available: true,
    rows: [
      { label: "Historial público de perfil", free: "Limitado", plus: "Completo", highlight: true },
      { label: "Badge de plan", free: "—", plus: "MATCHPOINT+" },
      { label: "Insights avanzados", free: "Básicos", plus: "En evolución" },
    ],
  },
];

export const MP_PLUS_COACH_PREVIEW_FEATURES: MpPlusBenefit[] = [
  {
    icon: "video",
    title: "Vista previa de análisis",
    description: "Explora cómo se verá el análisis táctico antes del backend real.",
  },
  {
    icon: "trending-up",
    title: "Fortalezas y errores demo",
    description: "Ejemplos de insights para entender qué entregará la herramienta.",
  },
  {
    icon: "target",
    title: "Drills sugeridos",
    description: "Recomendaciones de práctica mostradas como experiencia temprana.",
  },
  {
    icon: "line-chart",
    title: "Progreso simulado",
    description: "Mock de evolución para validar la experiencia de producto.",
  },
];

export const MP_PLUS_MANAGE_BENEFITS = [
  {
    metric: "24",
    title: "Roster de team",
    description: "Hasta 24 jugadores para capitanes MATCHPOINT+.",
    icon: "users",
  },
  {
    metric: "EA",
    title: "Coach AI",
    description: "Early access a la vista previa con datos demo.",
    icon: "sparkles",
  },
  {
    metric: "5x",
    title: "Renombrar team",
    description: "Hasta 5 cambios de nombre para tu team.",
    icon: "pencil",
  },
] as const;
