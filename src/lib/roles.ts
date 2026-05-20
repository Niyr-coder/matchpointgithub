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
        h: "Principal",
        items: [
          { k: "home", label: "Inicio", icon: "home" },
          { k: "clubes", label: "Clubes", icon: "building-2" },
          { k: "eventos", label: "Eventos", icon: "trophy" },
          { k: "ranking", label: "Ranking", icon: "bar-chart-3" },
          { k: "busco-partido", label: "Busco partido", icon: "swords" },
          { k: "quedadas", label: "Quedadas", icon: "party-popper", badge: "BETA" },
        ],
      },
      {
        h: "Comunidad",
        items: [
          { k: "chat", label: "Mensajes", icon: "message-square" },
          { k: "amigos", label: "Amigos", icon: "users" },
          { k: "team", label: "Mi Team", icon: "users-round" },
        ],
      },
      {
        h: "Coaching",
        items: [
          { k: "academia", label: "Academia", icon: "graduation-cap" },
          { k: "mis-clases", label: "Mis clases", icon: "list-checks" },
        ],
      },
      {
        h: "Tienda",
        items: [{ k: "shop", label: "Shop", icon: "shopping-bag" }],
      },
      {
        h: "Mi cuenta",
        items: [
          { k: "perfil", label: "Mi perfil", icon: "user" },
          { k: "personalizar", label: "Personalizar", icon: "palette" },
          { k: "solicitar-club", label: "Solicitar Club", icon: "building" },
        ],
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
        h: "Plataforma",
        items: [
          { k: "home", label: "Overview", icon: "home" },
          { k: "admin-clubs", label: "Clubes", icon: "building-2" },
          { k: "admin-users", label: "Usuarios", icon: "users" },
          { k: "admin-events", label: "Eventos", icon: "trophy" },
        ],
      },
      {
        h: "Monetización",
        items: [
          { k: "admin-pagos", label: "Pagos & Payouts", icon: "wallet" },
          { k: "admin-plans", label: "Planes premium", icon: "badge-check" },
          { k: "admin-cosmetics", label: "Bundles cosméticos", icon: "palette" },
        ],
      },
      {
        h: "Operación",
        items: [
          { k: "admin-mod", label: "Moderación", icon: "shield-alert" },
          { k: "admin-support", label: "Soporte", icon: "life-buoy" },
          { k: "admin-quedadas", label: "Quedadas", icon: "party-popper" },
          { k: "admin-team", label: "Equipo MP", icon: "user-cog" },
          { k: "admin-broadcast", label: "Comunicaciones", icon: "megaphone" },
        ],
      },
      {
        h: "Control & datos",
        items: [
          { k: "admin-roles", label: "Permisos & Roles", icon: "shield" },
          { k: "admin-flags", label: "Feature flags", icon: "flag" },
          { k: "admin-metrics", label: "Métricas", icon: "bar-chart-3" },
          { k: "admin-audit", label: "Audit log", icon: "history" },
        ],
      },
      {
        h: "Sistema",
        items: [{ k: "admin-config", label: "Configuración", icon: "settings" }],
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
          { k: "club-marketing", label: "Marketing", icon: "megaphone" },
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
        items: [{ k: "club-config", label: "Configuración del club", icon: "settings-2" }],
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
        items: [{ k: "c-perfil", label: "Mi perfil", icon: "user" }],
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
          { k: "e-walkins", label: "Walk-ins", icon: "user-plus" },
          { k: "e-reservas", label: "Reservas hoy", icon: "calendar-days" },
        ],
      },
      {
        h: "Caja",
        items: [
          { k: "e-caja", label: "Caja del día", icon: "banknote" },
          { k: "e-shop", label: "Pro shop", icon: "shopping-bag" },
        ],
      },
      {
        h: "Soporte",
        items: [{ k: "e-soporte", label: "Reportar problema", icon: "life-buoy" }],
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
export const MP_ROLE_SCREENS: Record<Exclude<RoleKey, "user">, string[]> = {
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
    "admin-flags",
    "admin-broadcast",
    "admin-quedadas",
  ],
  owner: ["club-reservas", "club-canchas", "club-clientes", "club-finanzas", "club-marketing", "club-config", "club-eventos", "club-staff"],
  manager: ["club-reservas", "club-canchas", "club-clientes", "club-eventos", "club-staff", "club-walkins", "club-reportes"],
  partner: ["p-ligas", "p-torneos", "p-brackets", "p-inscritos", "p-clubes", "p-finanzas", "p-marketing"],
  coach: ["c-clases", "c-alumnos", "c-calendar", "c-pagos", "c-recursos", "c-perfil"],
  employee: ["e-checkin", "e-walkins", "e-caja", "e-reservas", "e-shop", "e-soporte"],
};

export function mpRoleScreenExists(role: RoleKey, key: string): boolean {
  if (role === "user") return false;
  return (MP_ROLE_SCREENS[role] || []).includes(key);
}

export function findSidebarItem(role: RoleKey, key: string): SidebarItem | undefined {
  return MP_ROLES[role].sidebar.flatMap((g) => g.items).find((it) => it.k === key);
}
