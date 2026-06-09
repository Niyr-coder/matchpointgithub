// Roles — config central de los 7 roles del sistema MATCHPOINT.
// AGENTS.md hierarchy: ADMIN > OWNER > MANAGER > PARTNER > COACH > EMPLOYEE > USER
// Source de verdad migrada 1:1 desde el design system (ui_kits/dashboard/roles.jsx).

export type RoleKey =
  | "user"
  | "admin"
  | "owner"
  | "manager"
  | "partner"
  | "coach"
  | "employee";

export type SidebarItem = {
  k: string;
  label: string;
  icon: string;
  badge?: string;
  /** Si se setea, el item se oculta cuando ese feature flag está explícitamente off. */
  flag?: string;
};

export type SidebarGroup = {
  h: string;
  items: SidebarItem[];
};

export type RoleConfig = {
  k: RoleKey;
  l: string;
  ctx: string;
  sub: string;
  color: string;
  icon: string;
  badge: string;
  desc: string;
  sidebar: SidebarGroup[];
};

export const MP_ROLES: Record<RoleKey, RoleConfig> = {
  user: {
    k: "user",
    l: "Player",
    ctx: "",
    sub: "",
    color: "#10b981",
    icon: "user",
    badge: "JUGADOR",
    desc: "Reserva, juega, sube tu ranking.",
    sidebar: [
      {
        h: "Jugar",
        items: [
          { k: "home", label: "Inicio", icon: "home" },
          { k: "eventos", label: "Eventos", icon: "trophy" },
          { k: "ranking", label: "Ranking", icon: "bar-chart-3" },
          { k: "busco-partido", label: "Busco partido", icon: "swords" },
          { k: "quedadas", label: "Quedadas", icon: "party-popper", badge: "BETA", flag: "quedadas_enabled" },
        ],
      },
      {
        h: "Explorar",
        items: [
          { k: "clubes", label: "Clubes", icon: "building-2" },
          { k: "shop", label: "Shop", icon: "shopping-bag" },
        ],
      },
      {
        h: "Comunidad",
        items: [
          { k: "chat", label: "Mensajes", icon: "message-square" },
          { k: "mis-sorteos", label: "Mis sorteos", icon: "gift", flag: "club_giveaways_enabled" },
          { k: "amigos", label: "Amigos", icon: "users" },
          { k: "team", label: "Mi Team", icon: "users-round" },
        ],
      },
      {
        h: "Mejora tu juego",
        items: [
          { k: "coach-ai", label: "Coach AI", icon: "sparkles", badge: "MP+", flag: "coach_ai_enabled" },
          { k: "academia", label: "Academia", icon: "graduation-cap" },
          { k: "mis-clases", label: "Mis clases", icon: "list-checks" },
        ],
      },
      {
        h: "Mi cuenta",
        items: [
          { k: "perfil", label: "Mi perfil", icon: "user" },
          { k: "membresias", label: "Mis membresías", icon: "star" },
          { k: "mi-plan", label: "Mi plan MP+", icon: "crown", flag: "user_has_mp_plus" },
          { k: "soporte", label: "Soporte", icon: "life-buoy" },
          { k: "solicitar-club", label: "Solicitar Club", icon: "building" },
        ],
      },
      {
        h: "MATCHPOINT+",
        items: [{ k: "mp-plus", label: "MATCHPOINT+", icon: "crown", badge: "MP+", flag: "user_can_buy_mp_plus" }],
      },
    ],
  },
  admin: {
    k: "admin",
    l: "Admin · Plataforma",
    ctx: "",
    sub: "",
    color: "#dc2626",
    icon: "shield",
    badge: "ADMIN",
    desc: "Toda la plataforma. Métricas globales, moderación, configuración.",
    sidebar: [
      {
        h: "Resumen",
        items: [
          { k: "home", label: "Overview", icon: "home" },
          { k: "admin-metrics", label: "Métricas", icon: "bar-chart-3" },
        ],
      },
      {
        h: "Plataforma",
        items: [
          { k: "admin-clubs", label: "Clubes", icon: "building-2" },
          { k: "admin-users", label: "Usuarios", icon: "users" },
          { k: "admin-user-teams", label: "Teams", icon: "users-2" },
          { k: "admin-partners", label: "Partners", icon: "handshake" },
          { k: "admin-events", label: "Eventos", icon: "trophy" },
          { k: "admin-quedadas", label: "Quedadas", icon: "party-popper" },
          { k: "admin-matches", label: "Matches", icon: "swords" },
          { k: "admin-reservas", label: "Reservas", icon: "calendar-days" },
        ],
      },
      {
        h: "Operación",
        items: [
          { k: "admin-mod", label: "Moderación", icon: "shield-alert" },
          { k: "admin-support", label: "Soporte", icon: "life-buoy" },
          { k: "admin-recepcion", label: "Recepción", icon: "badge-check" },
          { k: "admin-broadcast", label: "Comunicaciones", icon: "megaphone" },
          { k: "admin-team", label: "Equipo MP", icon: "user-cog" },
        ],
      },
      {
        h: "Monetización",
        items: [
          { k: "admin-pagos", label: "Pagos & Payouts", icon: "wallet" },
          { k: "admin-plans", label: "Planes premium", icon: "badge-check" },
          { k: "admin-memberships", label: "Membresías clubes", icon: "star" },
          { k: "admin-ventas", label: "Ventas", icon: "briefcase-business" },
          { k: "admin-sponsors", label: "Patrocinadores", icon: "handshake" },
          { k: "admin-paywall-funnel", label: "Paywall funnel", icon: "activity" },
        ],
      },
      {
        h: "Sistema",
        items: [
          { k: "admin-roles", label: "Permisos & Roles", icon: "shield" },
          { k: "admin-flags", label: "Feature flags", icon: "flag" },
          { k: "admin-audit", label: "Audit log", icon: "history" },
          { k: "admin-ayuda-guias", label: "Ayuda y guías", icon: "book-open" },
          { k: "admin-config", label: "Configuración", icon: "settings" },
        ],
      },
    ],
  },
  owner: {
    k: "owner",
    l: "Owner · Club",
    ctx: "",
    sub: "",
    color: "#0a0a0a",
    icon: "crown",
    badge: "OWNER",
    desc: "Tu club: revenue, canchas, staff, eventos y configuración.",
    sidebar: [
      {
        h: "Mi club",
        items: [
          { k: "home", label: "Overview", icon: "home" },
          { k: "club-reservas", label: "Reservas", icon: "calendar-days" },
          { k: "club-canchas", label: "Canchas", icon: "square" },
          { k: "club-eventos", label: "Eventos del club", icon: "trophy" },
        ],
      },
      {
        h: "Negocio",
        items: [
          { k: "club-finanzas", label: "Finanzas", icon: "wallet" },
          { k: "club-membresias", label: "Membresías", icon: "star", flag: "club_memberships_v2" },
          { k: "club-marketing", label: "Marketing", icon: "megaphone", flag: "club_marketing_enabled" },
          { k: "club-anuncios", label: "Anuncios", icon: "megaphone" },
          { k: "club-sorteos", label: "Sorteos", icon: "gift", flag: "club_giveaways_enabled" },
        ],
      },
      {
        h: "Equipo & clientes",
        items: [
          { k: "club-clientes", label: "Clientes", icon: "users" },
          { k: "club-staff", label: "Personal", icon: "user-cog" },
        ],
      },
      {
        h: "Ajustes",
        items: [
          { k: "club-config", label: "Configuración del club", icon: "settings-2" },
        ],
      },
    ],
  },
  manager: {
    k: "manager",
    l: "Manager · Club",
    ctx: "",
    sub: "",
    color: "#0ea5e9",
    icon: "clipboard-list",
    badge: "MANAGER",
    desc: "Operación del día: reservas, canchas, atención al cliente.",
    sidebar: [
      {
        h: "Operación",
        items: [
          { k: "home", label: "Hoy", icon: "home" },
          { k: "club-reservas", label: "Reservas", icon: "calendar-days" },
          { k: "club-canchas", label: "Canchas", icon: "square" },
          { k: "club-walkins", label: "Walk-ins", icon: "user-plus" },
        ],
      },
      {
        h: "Club",
        items: [
          { k: "club-eventos", label: "Eventos del club", icon: "trophy" },
          { k: "club-clientes", label: "Clientes", icon: "users" },
          { k: "club-membresias", label: "Membresías", icon: "star", flag: "club_memberships_v2" },
          { k: "club-anuncios", label: "Anuncios", icon: "megaphone" },
          { k: "club-sorteos", label: "Sorteos", icon: "gift", flag: "club_giveaways_enabled" },
          { k: "club-staff", label: "Personal", icon: "user-cog" },
        ],
      },
      {
        h: "Análisis",
        items: [{ k: "club-reportes", label: "Reportes", icon: "bar-chart-3" }],
      },
    ],
  },
  partner: {
    k: "partner",
    l: "Partner · Organizador",
    ctx: "",
    sub: "",
    color: "#7c3aed",
    icon: "trophy",
    badge: "PARTNER",
    desc: "Tus ligas y torneos: inscripciones, brackets, payouts.",
    sidebar: [
      {
        h: "Mis torneos",
        items: [
          { k: "home", label: "Overview", icon: "home" },
          { k: "p-ligas", label: "Mis ligas", icon: "list-ordered" },
          { k: "p-torneos", label: "Mis torneos", icon: "trophy" },
          { k: "p-brackets", label: "Brackets", icon: "git-branch" },
        ],
      },
      {
        h: "Inscripciones",
        items: [
          { k: "p-inscritos", label: "Inscritos", icon: "users" },
          { k: "p-clubes", label: "Clubes asociados", icon: "building-2" },
        ],
      },
      {
        h: "Negocio",
        items: [
          { k: "p-finanzas", label: "Finanzas", icon: "wallet" },
          { k: "p-marketing", label: "Marketing", icon: "megaphone" },
        ],
      },
    ],
  },
  coach: {
    k: "coach",
    l: "Coach · Entrenador",
    ctx: "",
    sub: "",
    color: "#f59e0b",
    icon: "graduation-cap",
    badge: "COACH",
    desc: "Clases, alumnos, calendario y pagos.",
    sidebar: [
      {
        h: "Coaching",
        items: [
          { k: "home", label: "Hoy", icon: "home" },
          { k: "c-clases", label: "Mis clases", icon: "graduation-cap" },
          { k: "c-alumnos", label: "Alumnos", icon: "users" },
          { k: "c-calendar", label: "Calendario", icon: "calendar" },
          { k: "c-recursos", label: "Recursos", icon: "book-open" },
        ],
      },
      {
        h: "Negocio",
        items: [{ k: "c-pagos", label: "Pagos", icon: "wallet" }],
      },
      {
        h: "Cuenta",
        items: [
          { k: "c-perfil", label: "Mi perfil", icon: "user" },
        ],
      },
    ],
  },
  employee: {
    k: "employee",
    l: "Empleado · Recepción",
    ctx: "",
    sub: "",
    color: "#10b981",
    icon: "badge-check",
    badge: "EMPLEADO",
    desc: "Recepción y caja: check-in, walk-ins, cobros.",
    sidebar: [
      {
        h: "Recepción",
        items: [
          { k: "home", label: "Mi turno", icon: "home" },
          { k: "e-checkin", label: "Check-in", icon: "user-check" },
          { k: "e-walkins", label: "Walk-ins y canchas", icon: "user-plus" },
          { k: "e-calendario", label: "Calendario hoy", icon: "calendar" },
          { k: "e-reservas", label: "Semana completa", icon: "calendar-days" },
        ],
      },
      {
        h: "Caja & tienda",
        items: [
          { k: "e-caja", label: "Caja del día", icon: "banknote" },
          { k: "e-shop", label: "Tienda", icon: "shopping-bag" },
        ],
      },
      {
        h: "Operación",
        items: [{ k: "e-soporte", label: "Soporte", icon: "life-buoy" }],
      },
    ],
  },
};

export const MP_ROLE_ORDER: RoleKey[] = [
  "user",
  "admin",
  "owner",
  "manager",
  "partner",
  "coach",
  "employee",
];

// Qué pantallas están realmente implementadas (vs stub). Mantener en sync con los componentes migrados.
export const MP_ROLE_SCREENS: Record<RoleKey, string[]> = {
  user: [
    "ranking",
    "perfil",
    "clubes",
    "eventos",
    "chat",
    "amigos",
    "shop",
    "solicitar-club",
    "soporte",
    "mi-plan",
    "mp-plus",
    "team",
    "busco-partido",
    "quedadas",
    "coach-ai",
    "academia",
    "mis-clases",
    "ayuda-guias",
    "mis-reservas",
    "membresias",
  ],
  admin: [
    "admin-clubs",
    "admin-users",
    "admin-mod",
    "admin-pagos",
    "admin-plans",
    "admin-events",
    "admin-support",
    "admin-metrics",
    "admin-audit",
    "admin-config",
    "admin-roles",
    "admin-team",
    "admin-user-teams",
    "admin-partners",
    "admin-ayuda-guias",
    "admin-flags",
    "admin-broadcast",
    "admin-quedadas",
    "admin-matches",
    "admin-reservas",
    "admin-recepcion",
    "admin-memberships",
    "admin-ventas",
    "admin-sponsors",
    "admin-paywall-funnel",
  ],
  owner: ["club-reservas", "club-canchas", "club-clientes", "club-finanzas", "club-membresias", "club-marketing", "club-anuncios", "club-sorteos", "club-config", "club-eventos", "club-staff"],
  manager: ["club-reservas", "club-canchas", "club-clientes", "club-membresias", "club-anuncios", "club-sorteos", "club-eventos", "club-staff", "club-walkins", "club-reportes"],
  partner: ["p-ligas", "p-torneos", "p-brackets", "p-inscritos", "p-clubes", "p-finanzas", "p-marketing"],
  coach: ["c-clases", "c-alumnos", "c-calendar", "c-pagos", "c-recursos", "c-perfil"],
  employee: ["e-checkin", "e-walkins", "e-calendario", "e-caja", "e-reservas", "e-shop", "e-soporte"],
};

export function mpRoleScreenExists(role: RoleKey, key: string): boolean {
  return (MP_ROLE_SCREENS[role] || []).includes(key);
}

export function findSidebarItem(role: RoleKey, key: string): SidebarItem | undefined {
  return MP_ROLES[role].sidebar.flatMap((g) => g.items).find((it) => it.k === key);
}
