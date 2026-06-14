"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { MP_ROLES, type RoleKey, type SidebarItem } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { signOutAndRedirect } from "@/server/actions/auth";
import { SidebarRoleMenu } from "./SidebarRoleMenu";
import type { RoleSwitchOption } from "./ActiveRoleSwitcher";

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
  // Flags efectivos del usuario. Un item con `flag` se oculta si su flag está
  // explícitamente off (ausente o true = visible).
  flags?: Record<string, boolean>;
  roleSwitchOptions?: RoleSwitchOption[];
  /** Admin puede cambiar a cualquier rol demo desde el footer. */
  isAdmin?: boolean;
};

// Deriva la sección activa del pathname:
//   /dashboard/admin                → "home"
//   /dashboard/admin/admin-clubs    → "admin-clubs"
function activeFromPath(pathname: string, role: RoleKey): string {
  const prefix = `/dashboard/${role}`;
  if (pathname === prefix || pathname === `${prefix}/`) return "home";
  const rest = pathname.slice(prefix.length + 1).split("/")[0];
  if (role === "user" && rest === "mp-plus") return "mi-plan";
  return rest || "home";
}

export function DashboardSidebar({
  role,
  userName,
  contextLabel,
  badgeOverrides,
  mobileOpen = false,
  onMobileClose,
  flags,
  roleSwitchOptions,
  isAdmin,
}: Props) {
  const cfg = MP_ROLES[role];
  const itemVisible = (flag?: string) => !(flag && flags?.[flag] === false);
  // Anexamos solo "Ayuda y guías" como item global. Las pantallas operativas
  // como Soporte viven en MP_ROLES para mantener sidebar y screens en sync.
  const helpItems: SidebarItem[] = [{ k: "ayuda", label: "Ayuda y guías", icon: "info" }];
  const groups = [...cfg.sidebar, { h: "Ayuda", items: helpItems }];
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

  const [pending, startTransition] = useTransition();
  const [hover, setHover] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);

  const otherRoles = roleSwitchOptions?.filter((o) => o.role !== role).length ?? 0;
  const canSwitchRoles = Boolean(isAdmin || otherRoles > 0);

  useEffect(() => {
    if (!roleMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (footerRef.current && !footerRef.current.contains(e.target as Node)) {
        setRoleMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRoleMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [roleMenuOpen]);

  const doSignOut = () => {
    if (pending) return;
    startTransition(() => {
      void signOutAndRedirect();
    });
  };

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
        {groups.map((g) => {
          const items = g.items.filter((it) => itemVisible(it.flag));
          if (items.length === 0) return null;
          return (
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
              {items.map((it) => (
                <SidebarLink
                  key={it.k}
                  role={role}
                  item={it}
                  active={active === it.k}
                  badgeOverride={badgeOverrides?.[it.k]}
                />
              ))}
            </div>
          );
        })}
      </nav>
      <div ref={footerRef} style={{ position: "relative" }}>
        {roleMenuOpen && canSwitchRoles && (
          <SidebarRoleMenu
            current={role}
            isAdmin={isAdmin}
            options={roleSwitchOptions}
            onClose={() => setRoleMenuOpen(false)}
          />
        )}
        <div
          style={{
            padding: 12,
            borderTop: "1px solid var(--sidebar-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: hover && !pending ? "rgba(255,255,255,0.02)" : "transparent",
            transition: "background 120ms ease",
          }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <button
            type="button"
            onClick={() => canSwitchRoles && setRoleMenuOpen((v) => !v)}
            disabled={!canSwitchRoles}
            aria-expanded={canSwitchRoles ? roleMenuOpen : undefined}
            aria-haspopup={canSwitchRoles ? "dialog" : undefined}
            title={canSwitchRoles ? "Cambiar rol" : undefined}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 8,
              borderRadius: 8,
              minWidth: 0,
              border: 0,
              background: canSwitchRoles && roleMenuOpen ? "rgba(255,255,255,0.06)" : "transparent",
              cursor: canSwitchRoles ? "pointer" : "default",
              fontFamily: "inherit",
              textAlign: "left",
              transition: "background 120ms ease",
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
          {canSwitchRoles && (
            <Icon
              name={roleMenuOpen ? "chevron-down" : "chevron-up"}
              size={14}
              color="#71717a"
              style={{ flexShrink: 0 }}
            />
          )}
        </button>
        <button
          type="button"
          onClick={doSignOut}
          disabled={pending}
          aria-label={pending ? "Cerrando sesión" : "Cerrar sesión"}
          title="Cerrar sesión"
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "transparent",
            color: "var(--sidebar-muted)",
            border: 0,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.6 : 1,
            transition: "background 120ms ease, color 120ms ease",
          }}
          onMouseEnter={(e) => {
            if (pending) return;
            e.currentTarget.style.background = "rgba(239,68,68,0.12)";
            e.currentTarget.style.color = "#fca5a5";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--sidebar-muted)";
          }}
        >
          <Icon name="log-out" size={16} />
        </button>
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
