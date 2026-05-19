// Pill flotante de navegación mobile. Toma los primeros 3 items del primer
// grupo del sidebar del rol activo + un botón "Más" que abre el drawer con
// la jerarquía completa. Solo visible en mobile (md:hidden).
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";

type Props = {
  role: RoleKey;
  onOpenDrawer: () => void;
};

export function MobileBottomNav({ role, onOpenDrawer }: Props) {
  const cfg = MP_ROLES[role];
  const items = cfg.sidebar[0]?.items.slice(0, 3) ?? [];
  const pathname = usePathname() || "";
  const prefix = `/dashboard/${role}`;
  const activeKey =
    pathname === prefix || pathname === `${prefix}/`
      ? "home"
      : pathname.slice(prefix.length + 1).split("/")[0] || "home";

  return (
    <nav
      className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30"
      aria-label="Navegación rápida"
    >
      <div
        className="flex items-center gap-1 px-2 py-2 rounded-2xl backdrop-blur-md"
        style={{
          background: "rgba(10,10,10,0.78)",
          boxShadow:
            "0 12px 32px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.08) inset",
        }}
      >
        {items.map((it) => {
          const href = it.k === "home" ? prefix : `${prefix}/${it.k}`;
          const active = activeKey === it.k;
          return (
            <Link
              key={it.k}
              href={href}
              className="flex flex-col items-center justify-center w-14 h-12 rounded-xl"
              style={{
                background: active ? "var(--primary)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.72)",
                textDecoration: "none",
                transition: "background 120ms ease, color 120ms ease",
              }}
              aria-label={it.label}
            >
              <Icon name={it.icon} size={18} />
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  marginTop: 2,
                  letterSpacing: "0.04em",
                }}
              >
                {it.label}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex flex-col items-center justify-center w-14 h-12 rounded-full"
          style={{
            background: "transparent",
            color: "rgba(255,255,255,0.72)",
            border: 0,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 120ms ease, color 120ms ease",
          }}
          aria-label="Más opciones"
        >
          <Icon name="menu" size={18} />
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              marginTop: 2,
              letterSpacing: "0.04em",
            }}
          >
            Más
          </span>
        </button>
      </div>
    </nav>
  );
}
