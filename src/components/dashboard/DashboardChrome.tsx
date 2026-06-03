// Client wrapper que envuelve sidebar + topbar + bottom pill + main, y maneja
// el estado del drawer mobile compartido entre el sidebar y el bottom nav.
// El layout.tsx server pasa la data fetcheada como props.
"use client";
import { useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { DashboardSidebar } from "./DashboardSidebar";
import { TopBar } from "./TopBar";
import { MobileBottomNav } from "./MobileBottomNav";
import { ActiveRoleSwitcher, type RoleSwitchOption } from "./ActiveRoleSwitcher";

type Props = {
  role: RoleKey;
  userName: string;
  contextLabel: string | null;
  badgeOverrides?: Record<string, number | string>;
  /** Banner global (anuncio activo o mantenimiento). null = sin banner. Lo ven todos los roles. */
  banner?: { message: string; level: "info" | "warn" | "critical"; ctaLabel?: string | null; ctaHref?: string | null } | null;
  /** Flags efectivos del usuario, para gatear items del sidebar. */
  flags?: Record<string, boolean>;
  /** Otros roles asignados (cambio explícito vía switchRole). */
  roleSwitchOptions?: RoleSwitchOption[];
  children: ReactNode;
};

export function DashboardChrome({
  role,
  userName,
  contextLabel,
  badgeOverrides,
  banner,
  flags,
  roleSwitchOptions,
  children,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const pathname = usePathname();
  const isMessagesRoute = /\/dashboard\/[^/]+\/chat\/?$/.test(pathname ?? "");

  // Cerrar drawer cuando cambia la ruta (user tapeó un link adentro).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll mientras el drawer mobile está abierto.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--fg)",
      }}
    >
      <DashboardSidebar
        role={role}
        userName={userName}
        contextLabel={contextLabel}
        badgeOverrides={badgeOverrides}
        mobileOpen={drawerOpen}
        onMobileClose={() => setDrawerOpen(false)}
        flags={flags}
        roleSwitchOptions={roleSwitchOptions}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <TopBar role={role} contextLabel={contextLabel} />
        {banner && !bannerDismissed && (() => {
          const lvl = { info: { bg: "#dbeafe", bd: "#93c5fd", fg: "#1e3a8a", ic: "info" }, warn: { bg: "#fef3c7", bd: "#fcd34d", fg: "#78350f", ic: "alert-triangle" }, critical: { bg: "#fee2e2", bd: "#fca5a5", fg: "#7f1d1d", ic: "alert-octagon" } }[banner.level];
          return (
            <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: lvl.bg, borderBottom: `1px solid ${lvl.bd}`, color: lvl.fg }}>
              <Icon name={lvl.ic} size={15} color={lvl.fg} />
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, lineHeight: 1.4 }}>{banner.message}</span>
              {banner.ctaLabel && banner.ctaHref && (
                <a href={banner.ctaHref} style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: lvl.fg, textDecoration: "underline", whiteSpace: "nowrap" }}>{banner.ctaLabel}</a>
              )}
              <button onClick={() => setBannerDismissed(true)} aria-label="Cerrar aviso" style={{ background: "transparent", border: 0, color: lvl.fg, cursor: "pointer", display: "inline-flex", padding: 2, flexShrink: 0 }}>
                <Icon name="x" size={14} color={lvl.fg} />
              </button>
            </div>
          );
        })()}
        <main
          className={`mp-dashboard-main flex flex-col flex-1 min-h-0 min-w-0 w-full max-w-full overflow-x-hidden p-4 md:p-7 md:gap-5 md:pb-7 ${
            isMessagesRoute ? "gap-0 max-lg:pb-[4.75rem]" : "gap-4 pb-24"
          }`}
        >
          {children}
        </main>
      </div>
      <MobileBottomNav role={role} onOpenDrawer={() => setDrawerOpen(true)} />
    </div>
  );
}
