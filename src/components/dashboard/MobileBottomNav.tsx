// Pill flotante de navegación mobile. Toma los primeros 3 items del primer
// grupo del sidebar del rol activo + un botón "Más" que abre el drawer con
// la jerarquía completa. Solo visible en mobile (md:hidden).
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { useMobileBottomNavSuppressed } from "./useMobileBottomNavSuppressed";

type Props = {
  role: RoleKey;
  onOpenDrawer: () => void;
  drawerOpen?: boolean;
};

/** Etiqueta corta solo en la pill mobile (sidebar sigue con el label completo). */
function mobileNavLabel(label: string, key: string): string {
  const short: Record<string, string> = {
    home: "Inicio",
    "p-ligas": "Ligas",
    "p-torneos": "Torneos",
    "p-brackets": "Brackets",
    "p-inscritos": "Inscritos",
    "p-clubes": "Clubes",
    "p-finanzas": "Finanzas",
    "p-marketing": "Marketing",
    "c-clases": "Clases",
    "c-alumnos": "Alumnos",
    "c-calendar": "Agenda",
    "e-checkin": "Check-in",
    "e-walkins": "Walk-ins",
    "e-calendario": "Hoy",
    "e-reservas": "Semana",
  };
  if (short[key]) return short[key];
  if (label.startsWith("Mis ")) return label.slice(4);
  return label;
}

export function MobileBottomNav({ role, onOpenDrawer, drawerOpen = false }: Props) {
  const cfg = MP_ROLES[role];
  const items = cfg.sidebar[0]?.items.slice(0, 3) ?? [];
  const pathname = usePathname() || "";
  const prefix = `/dashboard/${role}`;
  const activeKey =
    pathname === prefix || pathname === `${prefix}/`
      ? "home"
      : pathname.slice(prefix.length + 1).split("/")[0] || "home";
  const suppressed = useMobileBottomNavSuppressed(drawerOpen);

  return (
    <nav
      className="mp-mobile-bottom-nav md:hidden fixed z-20"
      aria-label="Navegación rápida"
      aria-hidden={suppressed}
      style={{
        left: "max(12px, env(safe-area-inset-left, 0px))",
        right: "max(12px, env(safe-area-inset-right, 0px))",
        bottom: "max(16px, env(safe-area-inset-bottom, 0px))",
        transform: suppressed ? "translateY(calc(100% + 24px))" : "none",
        opacity: suppressed ? 0 : 1,
        pointerEvents: suppressed ? "none" : "auto",
        transition: "transform 200ms var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)), opacity 160ms ease",
      }}
    >
      <div className="mp-mobile-bottom-nav-inner">
        {items.map((it) => {
          const href = it.k === "home" ? prefix : `${prefix}/${it.k}`;
          const active = activeKey === it.k;
          return (
            <Link
              key={it.k}
              href={href}
              className={`mp-mobile-bottom-nav-item${active ? " is-active" : ""}`}
              aria-label={it.label}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={it.icon} size={18} />
              <span className="mp-mobile-bottom-nav-label">{mobileNavLabel(it.label, it.k)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenDrawer}
          className="mp-mobile-bottom-nav-item mp-mobile-bottom-nav-more"
          aria-label="Más opciones"
        >
          <Icon name="menu" size={18} />
          <span className="mp-mobile-bottom-nav-label">Más</span>
        </button>
      </div>
    </nav>
  );
}
