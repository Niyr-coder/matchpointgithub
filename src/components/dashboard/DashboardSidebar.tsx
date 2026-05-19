"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MP_ROLES, type RoleKey, type SidebarItem } from "@/lib/roles";
import { Icon } from "@/components/Icon";

type Props = {
  role: RoleKey;
  userName?: string;
  contextLabel?: string | null;
  // Counters dinámicos por item key. Si está, override del badge estático.
  // Ej: { "club-reservas": 12, "club-clientes": 486 }. Si el valor es 0 o
  // undefined, no se muestra badge.
  badgeOverrides?: Record<string, number | string | null | undefined>;
  // Mobile drawer: el chrome wrapper controla apertura/cierre desde el bottom
  // pill. En desktop estos props son ignorados (la sidebar es sticky lateral).
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

// Deriva la sección activa del pathname:
//   /dashboard/admin                → "home"
//   /dashboard/admin/admin-clubs    → "admin-clubs"
function activeFromPath(pathname: string, role: RoleKey): string {
  const prefix = `/dashboard/${role}`;
  if (pathname === prefix || pathname === `${prefix}/`) return "home";
  const rest = pathname.slice(prefix.length + 1).split("/")[0];
  return rest || "home";
}

export function DashboardSidebar({
  role,
  userName,
  contextLabel,
  badgeOverrides,
  mobileOpen = false,
  onMobileClose,
}: Props) {
  const cfg = MP_ROLES[role];
  // Anexamos un grupo "Soporte" con Ayuda para todos los roles, sin tocar
  // la config estática de roles.ts. /dashboard/[role]/ayuda es global.
  const groups = [
    ...cfg.sidebar,
    {
      h: "Soporte",
      items: [{ k: "ayuda", label: "Ayuda y guías", icon: "info" }],
    },
  ];
  const pathname = usePathname() || "";
  const active = activeFromPath(pathname, role);
  const displayName = userName ?? "Tu cuenta";
  const initials =
    displayName
      .split(" ")
      .map((n) => n[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "·";
  const contextSub = contextLabel ?? cfg.l;

  return (
    <>
      {/* Backdrop solo mobile cuando drawer abierto. */}
      <div
        className={`md:hidden fixed inset-0 z-40 bg-black/55 transition-opacity ${
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onMobileClose}
        aria-hidden
      />
      <aside
        className={`flex flex-col flex-shrink-0 fixed inset-y-0 left-0 z-50 w-64 transform transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        style={{
          background: "var(--sidebar-bg)",
          color: "var(--sidebar-fg)",
          borderRight: "1px solid var(--sidebar-border)",
          height: "100vh",
        }}
      >
      <div
        style={{
          padding: "18px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          borderBottom: "1px solid var(--sidebar-border)",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="dot" style={{ fontSize: 20 }}>
            ●
          </span>
          <span
            className="font-heading"
            style={{ fontWeight: 900, letterSpacing: "-0.02em", fontSize: 18 }}
          >
            MATCHPOINT
          </span>
        </div>
        {role === "admin" && (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 4,
              background: cfg.color,
              color: "#fff",
              fontSize: 8,
              fontWeight: 900,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            {cfg.badge}
          </span>
        )}
      </div>
      <nav style={{ padding: 12, flex: 1, overflowY: "auto" }}>
        {groups.map((g) => (
          <div key={g.h} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 900,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "#71717a",
                padding: "6px 10px 8px",
              }}
            >
              {g.h}
            </div>
            {g.items.map((it) => (
              <SidebarLink
                key={it.k}
                role={role}
                item={it}
                active={active === it.k}
                badgeOverride={badgeOverrides?.[it.k]}
              />
            ))}
          </div>
        ))}
      </nav>
      <div style={{ padding: 12, borderTop: "1px solid var(--sidebar-border)" }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: 8,
            borderRadius: 8,
            background: "var(--sidebar)",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background:
                cfg.k !== "user" ? cfg.color : "linear-gradient(135deg, #10b981, #047857)",
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 11,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: "#a1a1aa",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {contextSub}
            </div>
          </div>
          <Icon name="chevrons-up-down" size={14} color="#a1a1aa" />
        </div>
      </div>
      </aside>
    </>
  );
}

function SidebarLink({
  role,
  item,
  active,
  badgeOverride,
}: {
  role: RoleKey;
  item: SidebarItem;
  active: boolean;
  badgeOverride?: number | string | null;
}) {
  const href = item.k === "home" ? `/dashboard/${role}` : `/dashboard/${role}/${item.k}`;
  // Override gana sobre badge estático. null/undefined/0 → sin badge.
  const badge =
    badgeOverride !== undefined
      ? badgeOverride && badgeOverride !== 0
        ? String(badgeOverride)
        : null
      : (item.badge ?? null);
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: 8,
        background: active ? "var(--primary)" : "transparent",
        color: active ? "#fff" : "var(--sidebar-muted)",
        border: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        textAlign: "left",
        marginBottom: 2,
        textDecoration: "none",
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "#27272a";
          e.currentTarget.style.color = "#fff";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--sidebar-muted)";
        }
      }}
    >
      <Icon name={item.icon} size={15} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {badge && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 900,
            background: active ? "rgba(255,255,255,0.25)" : "var(--primary)",
            color: "#fff",
            padding: "2px 7px",
            borderRadius: 9999,
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
